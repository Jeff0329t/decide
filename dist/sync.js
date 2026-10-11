// DECIDE. 決定ログの端末間同期（PRO・ログイン済み・設定でONにした人だけ）
// ONのときだけ決定ログ本文をSupabase decision_logs に保存する（RLSで本人のみ読み書き可）。
// 削除は墓標（deleted=true）として送り、他の端末にも反映する。OFFにしてもサーバーの内容は消さない。
(function(){
  const STORE_KEY = 'decide.tarot.sync.v1';
  const TABLE = 'decision_logs';
  const PAGE = 1000;
  const DEBOUNCE_MS = 2000;

  const notify = message => { if(typeof toast === 'function') toast(message); };
  const auth = () => window.DECIDE_AUTH || null;
  const ent = () => window.DECIDE_ENTITLEMENTS || null;
  const app = () => window.DECIDE_APP_BRIDGE || null;

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const tombstones = Array.isArray(raw.tombstones) ? raw.tombstones.filter(id => typeof id === 'string' && id) : [];
      const lastUserId = typeof raw.lastUserId === 'string' && raw.lastUserId ? raw.lastUserId : null;
      return { tombstones: [...new Set(tombstones)], lastSyncAt: raw.lastSyncAt || null, lastErrorAt: raw.lastErrorAt || null, autoOn: raw.autoOn === true, lastUserId };
    } catch(error) {
      return { tombstones: [], lastSyncAt: null, lastErrorAt: null, autoOn: false, lastUserId: null };
    }
  }
  let state = loadState();
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(error) {}
  }

  // 純粋関数（テスト用にも公開）
  const isValidLog = log => !!log && typeof log === 'object' && typeof log.id === 'string' && log.id !== '' && Array.isArray(log.nodes);
  // 最後に手を入れた時刻。updatedAt がない古いログは振り返り・ストーリー・作成の新しい方で代用する
  const stampOf = log => Math.max(0, ...['updatedAt', 'reviewedAt', 'storyUpdatedAt', 'createdAt']
    .map(key => Date.parse(log?.[key] || '')).filter(Number.isFinite));
  const byNewest = (a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
  // 同じIDが両方にあるときは項目ごとに合わせる（shared.js の DECIDE_MERGE_LOG。読めないときは新しい方を丸ごと採用）
  const mergeLog = (a, b) => (globalThis.DECIDE_MERGE_LOG || ((x, y) => ({ log: stampOf(y) > stampOf(x) ? y : x })))(a, b);
  const canonical = value => (globalThis.DECIDE_CANONICAL_JSON || JSON.stringify)(value);

  // local: 端末のログ配列 / remote: サーバーの行 [{id,data,deleted}] / tombstones: 端末で消したID
  // 戻り値 { logs: 端末に残すログ, upload: サーバーへ送る行 [{id,data,deleted}] }
  function merge(local, remote, tombstones) {
    const localMap = new Map((local || []).filter(isValidLog).map(log => [log.id, log]));
    const remoteMap = new Map((remote || []).filter(row => row && typeof row.id === 'string').map(row => [row.id, row]));
    const dead = new Set(tombstones || []);
    const result = new Map();
    const upload = [];

    for(const id of dead) {
      localMap.delete(id);
      const row = remoteMap.get(id);
      if(!row || !row.deleted) upload.push({ id, data: null, deleted: true });
    }
    for(const [id, row] of remoteMap) {
      if(dead.has(id)) continue;
      const mine = localMap.get(id);
      if(row.deleted) { localMap.delete(id); continue; }
      if(!isValidLog(row.data)) {
        if(mine) upload.push({ id, data: mine, deleted: false });
        continue;
      }
      if(!mine) { result.set(id, row.data); continue; }
      const merged = mergeLog(mine, row.data).log;
      result.set(id, merged);
      if(canonical(merged) !== canonical(row.data)) upload.push({ id, data: merged, deleted: false });
    }
    for(const [id, log] of localMap) {
      if(result.has(id) || remoteMap.has(id)) continue;
      result.set(id, log);
      upload.push({ id, data: log, deleted: false });
    }
    return { logs: [...result.values()].sort(byNewest), upload };
  }

  function isOn() {
    const settings = app()?.getSettings?.();
    return !!settings && settings.cloudSync === true;
  }
  function canSync() {
    return !!auth()?.isEnabled?.() && !!auth()?.getUser?.() && !!ent()?.hasProAccess?.();
  }

  async function fetchRemote(db, userId) {
    const rows = [];
    for(let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(TABLE).select('id,data,deleted').eq('user_id', userId).range(from, from + PAGE - 1);
      if(error) throw error;
      rows.push(...(data || []));
      if(!data || data.length < PAGE) break;
    }
    return rows;
  }

  // 前に同期したのと別のアカウントでログインしたら、確かめるまで同期を止める
  let paused = false;
  const accountOk = user => !paused && !!user && state.lastUserId === user.id;

  let running = null;
  let again = false;
  let applying = false;
  let warned = false;
  const asRows = logs => logs.map(data => ({ id: data.id, data, deleted: false }));
  async function syncNow({ quiet = true } = {}) {
    if(running) { again = true; return running; }
    running = (async () => {
      try {
        if(!isOn() || !accountOk(auth()?.getUser?.())) return false;
        await ent()?.refresh?.();
        if(!canSync()) return false;
        const db = auth().client?.();
        const user = auth().getUser();
        const bridge = app();
        if(!db || !user || !bridge || !accountOk(user)) return false;
        const remote = await fetchRemote(db, user.id);
        const sentTombstones = [...state.tombstones];
        const snapshot = JSON.stringify(bridge.getLogs());
        let { logs, upload } = merge(bridge.getLogs(), remote, sentTombstones);
        for(let i = 0; i < upload.length; i += 200) {
          const rows = upload.slice(i, i + 200).map(row => ({ user_id: user.id, id: row.id, data: row.data, deleted: row.deleted }));
          const { error } = await db.from(TABLE).upsert(rows, { onConflict: 'user_id,id' });
          if(error) throw error;
        }
        state.tombstones = state.tombstones.filter(id => !sentTombstones.includes(id));
        state.lastSyncAt = new Date().toISOString();
        state.lastErrorAt = null;
        saveState();
        // 送信を待つあいだに端末で編集・追加・削除されていたら、それを消さないように重ね直して次の同期で送る
        const current = bridge.getLogs();
        const before = JSON.stringify(current);
        if(before !== snapshot) {
          logs = merge(current, asRows(logs), state.tombstones).logs;
          again = true;
        }
        if(JSON.stringify(logs) !== before) {
          bridge.setLogs(logs);
          applying = true;
          try { bridge.persist(); } finally { applying = false; }
          bridge.render();
        }
        if(!quiet) notify('決定ログを同期しました');
        return true;
      } catch(error) {
        console.warn('[DECIDE sync]', error);
        state.lastErrorAt = new Date().toISOString();
        saveState();
        // 自動同期の失敗も、オンラインなのに失敗したときは1回だけ知らせる（詳しくは設定のログの同期欄に出す）
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        if(!quiet || (online && !warned)) { warned = true; notify('同期できませんでした。通信状況を確認してください'); }
        return false;
      } finally {
        running = null;
        if(again) { again = false; setTimeout(() => syncNow(), 0); }
      }
    })();
    return running;
  }

  let timer = null;
  function schedule() {
    if(applying || !isOn()) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), DEBOUNCE_MS);
  }

  function markDeleted(id) {
    if(typeof id !== 'string' || !id || !isOn()) return;
    if(!state.tombstones.includes(id)) state.tombstones.push(id);
    saveState();
  }

  // まだサーバーに送っていない件数（削除の印＋最終同期より後に変わったログ。一度も同期していなければ全件）
  function unsyncedCount(logs, st) {
    const list = Array.isArray(logs) ? logs.filter(isValidLog) : [];
    const tomb = Array.isArray(st?.tombstones) ? st.tombstones.length : 0;
    const last = Date.parse(st?.lastSyncAt || '');
    if(!Number.isFinite(last)) return list.length + tomb;
    return list.filter(log => { const t = Date.parse(stampOf(log) || ''); return Number.isFinite(t) && t > last; }).length + tomb;
  }

  // 設定画面（ログイン中のアカウント欄）に出すスイッチ
  function renderToggle() {
    if(!auth()?.getUser?.()) return '';
    const pro = !!ent()?.hasProAccess?.();
    const on = pro && isOn();
    const note = pro
      ? (on
        ? '決定ログをサーバーに保存し、同じアカウントでログインした別の端末でも見られます。OFFにすると以後の同期を止めます（サーバーの内容はアカウント削除で消えます）。'
        : 'ONにすると、決定ログをサーバーに保存し、同じアカウントでログインした別の端末でも見られます。OFFのあいだ、ログはこの端末の中だけに保存されます。')
      : '別の端末と決定ログを同期できます（UNLIMITED EDITION限定）。ログはこの端末の中に保存されています。';
    const status = on ? syncStatus() : '';
    const actions = on
      ? `<div class="sync-actions"><button class="sync-action-button" type="button" data-sync-action="now"${running ? ' disabled' : ''}>今すぐ同期</button><button class="sync-action-button" type="button" data-action="export-markdown">バックアップを書き出す</button></div>`
      : '';
    return `<div class="feedback-setting sync-setting"><div><b>ログの同期</b><p>${note}</p>${status}${actions}</div>
      <button class="toggle-button ${on ? 'on' : ''}" type="button" aria-label="ログの同期" data-sync-action="toggle" aria-pressed="${on}"><span></span><b>${on ? 'ON' : 'OFF'}</b></button></div>`;
  }

  function syncStatus() {
    const fmt = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    if(running) return '<p class="sync-status is-busy" role="status">同期中…</p>';
    const pending = unsyncedCount(app()?.getLogs?.(), state);
    const rest = pending > 0 ? `・未同期 ${pending}件` : '';
    if(state.lastErrorAt) return `<p class="sync-status is-error" role="status">${fmt(state.lastErrorAt)} の同期に失敗しました。通信が戻ると自動でやり直します。${pending > 0 ? `（未同期 ${pending}件）` : ''}</p>`;
    if(state.lastSyncAt) return `<p class="sync-status" role="status">最終同期 ${fmt(state.lastSyncAt)}${rest}</p>`;
    return `<p class="sync-status" role="status">まだ同期していません${pending > 0 ? `（未同期 ${pending}件）` : ''}</p>`;
  }

  function refreshSettings() {
    const wrap = document.querySelector('#settings-modal');
    if(wrap) auth()?.renderSettings?.(wrap);
  }

  // PROの人がログインしたら、この端末で一度だけ同期を自動でONにする（あとで手動OFFにしたらそのまま）
  async function autoEnable() {
    if(state.autoOn || !auth()?.getUser?.()) return false;
    const bridge = app();
    const settings = bridge?.getSettings?.();
    if(!settings) return false;
    await ent()?.refresh?.();
    if(!ent()?.hasProAccess?.()) return false;
    state.autoOn = true;
    saveState();
    if(settings.cloudSync === true) return false;
    settings.cloudSync = true;
    bridge.persist?.();
    refreshSettings();
    return true;
  }

  async function toggle() {
    const bridge = app();
    const settings = bridge?.getSettings?.();
    if(!settings) return;
    if(settings.cloudSync === true) {
      settings.cloudSync = false;
      bridge.persist();
      refreshSettings();
      notify('同期をOFFにしました');
      return;
    }
    await ent()?.refresh?.();
    if(!ent()?.hasProAccess?.()) { ent()?.openPaywall?.(); return; }
    settings.cloudSync = true;
    bridge.persist();
    refreshSettings();
    await syncNow({ quiet: false });
    refreshSettings();
  }

  // 別のアカウントに切りかわったとき：前のアカウントの削除記録などは持ちこまない
  function adoptAccount(user) {
    state.tombstones = [];
    state.lastSyncAt = null;
    state.lastErrorAt = null;
    state.lastUserId = user.id;
    saveState();
  }

  // ログインしたアカウントが、この端末で前に同期したアカウントと同じか確かめる。
  // 違うアカウントで、この端末にログがあり、同期が動きそうなときは、まとめてよいか聞くまで同期しない。
  async function checkAccount(user) {
    if(!user) return false;
    if(state.lastUserId === user.id) return !paused;
    if(!state.lastUserId) { state.lastUserId = user.id; saveState(); return true; }
    const logs = app()?.getLogs?.() || [];
    let wouldSync = isOn();
    if(!wouldSync && !state.autoOn) { await ent()?.refresh?.(); wouldSync = !!ent()?.hasProAccess?.(); }
    if(!logs.length || !wouldSync) { adoptAccount(user); return true; }
    paused = true;
    openAccountConfirm(user);
    return false;
  }

  const SHEET_ID = 'sync-account-modal';
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function openAccountConfirm(user) {
    if(document.querySelector(`#${SHEET_ID}`)) return;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.id = SHEET_ID;
    wrap.innerHTML = `<button class="modal-shade" type="button" data-sync-action="close" aria-label="閉じる"></button>
      <section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="${SHEET_ID}-title">
        <div class="sheet-handle" aria-hidden="true"></div>
        <div class="sheet-head"><h2 id="${SHEET_ID}-title">別のアカウントでログインしました</h2><button type="button" data-sync-action="close" aria-label="閉じる">×</button></div>
        <p>${escapeHtml(user.email)} は、この端末で前に同期していたアカウントとは別のアカウントです。</p>
        <p>この端末の決定ログを、このアカウントにまとめて同期しますか？同期しない場合も、この端末のログはそのまま残ります。</p>
        <div class="confirm-actions">
          <button class="button" type="button" data-sync-action="account-merge">このアカウントに同期する</button>
          <button class="button secondary" type="button" data-sync-action="account-keep">この端末では同期しない</button>
        </div>
      </section>`;
    if(typeof mountModal === 'function') mountModal(wrap, '.confirm-actions button');
    else document.body.appendChild(wrap);
  }
  function closeAccountConfirm() {
    if(typeof closeModal === 'function') closeModal(`#${SHEET_ID}`);
    else document.querySelector(`#${SHEET_ID}`)?.remove();
  }

  async function resolveAccount(merge) {
    const user = auth()?.getUser?.();
    closeAccountConfirm();
    if(!user) { paused = false; return; }
    adoptAccount(user);
    paused = false;
    if(merge) {
      await autoEnable().catch(() => {});
      await syncNow({ quiet: false });
    } else {
      const bridge = app();
      const settings = bridge?.getSettings?.();
      state.autoOn = true;
      saveState();
      if(settings && settings.cloudSync === true) { settings.cloudSync = false; bridge.persist?.(); }
      notify('この端末では同期をOFFにしました');
    }
    refreshSettings();
  }

  document.addEventListener('click', event => {
    const el = event.target.closest?.('[data-sync-action]');
    if(!el) return;
    event.preventDefault();
    const action = el.dataset.syncAction;
    if(action === 'toggle') { if(paused) openAccountConfirm(auth()?.getUser?.() || {}); else toggle(); }
    // 閉じただけのときは決めていないので、同期は止めたまま（次に開いたときにまた聞く）
    else if(action === 'now') { if(!running) { const job = syncNow({ quiet: false }); refreshSettings(); Promise.resolve(job).finally(refreshSettings); } }
    else if(action === 'close') closeAccountConfirm();
    else if(action === 'account-merge') resolveAccount(true);
    else if(action === 'account-keep') resolveAccount(false);
  });

  const start = user => checkAccount(user).then(ok => ok ? autoEnable().then(() => syncNow()) : false).catch(() => {});
  const a = auth();
  if(a?.isEnabled?.()) {
    a.onChange?.(user => {
      if(user) { start(user); return; }
      // ログアウトしたら、聞きかけの確認は閉じる（次にログインしたアカウントでまた確かめる）
      paused = false;
      closeAccountConfirm();
    });
    Promise.resolve(a.ready?.()).then(user => start(user || a.getUser?.())).catch(() => {});
  }
  window.addEventListener('online', () => syncNow());

  window.DECIDE_SYNC = Object.freeze({
    schedule,
    markDeleted,
    syncNow,
    renderToggle,
    isOn,
    autoEnable,
    _pure: { merge, mergeLog, isValidLog, stampOf, unsyncedCount }
  });
})();

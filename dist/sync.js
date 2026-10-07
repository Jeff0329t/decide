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
      return { tombstones: [...new Set(tombstones)], lastSyncAt: raw.lastSyncAt || null, autoOn: raw.autoOn === true };
    } catch(error) {
      return { tombstones: [], lastSyncAt: null, autoOn: false };
    }
  }
  let state = loadState();
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(error) {}
  }

  // 純粋関数（テスト用にも公開）
  const isValidLog = log => !!log && typeof log === 'object' && typeof log.id === 'string' && log.id !== '' && Array.isArray(log.nodes);
  const stampOf = log => { const t = Date.parse(log?.reviewedAt || log?.createdAt || ''); return Number.isFinite(t) ? t : 0; };
  const byNewest = (a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);

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
      const winner = stampOf(row.data) > stampOf(mine) ? row.data : mine;
      result.set(id, winner);
      if(winner === mine && JSON.stringify(mine) !== JSON.stringify(row.data)) upload.push({ id, data: mine, deleted: false });
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

  let running = null;
  let again = false;
  let applying = false;
  async function syncNow({ quiet = true } = {}) {
    if(running) { again = true; return running; }
    running = (async () => {
      try {
        if(!isOn() || !auth()?.getUser?.()) return false;
        await ent()?.refresh?.();
        if(!canSync()) return false;
        const db = auth().client?.();
        const user = auth().getUser();
        const bridge = app();
        if(!db || !user || !bridge) return false;
        const remote = await fetchRemote(db, user.id);
        const sentTombstones = [...state.tombstones];
        const { logs, upload } = merge(bridge.getLogs(), remote, sentTombstones);
        for(let i = 0; i < upload.length; i += 200) {
          const rows = upload.slice(i, i + 200).map(row => ({ user_id: user.id, id: row.id, data: row.data, deleted: row.deleted }));
          const { error } = await db.from(TABLE).upsert(rows, { onConflict: 'user_id,id' });
          if(error) throw error;
        }
        state.tombstones = state.tombstones.filter(id => !sentTombstones.includes(id));
        state.lastSyncAt = new Date().toISOString();
        saveState();
        const before = JSON.stringify(bridge.getLogs());
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
        if(!quiet) notify('同期できませんでした。通信状況を確認してください');
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

  // 設定画面（ログイン中のアカウント欄）に出すスイッチ
  function renderToggle() {
    if(!auth()?.getUser?.()) return '';
    const pro = !!ent()?.hasProAccess?.();
    const on = pro && isOn();
    const note = pro
      ? 'ONにすると、決定ログをサーバーに保存し、同じアカウントでログインした別の端末でも見られます。OFFに戻すと同期を止めます（サーバーの内容はアカウント削除で消えます）。'
      : '別の端末と決定ログを同期できます（PRO限定）。';
    return `<div class="feedback-setting sync-setting"><div><b>ログの同期</b><p>${note}</p></div>
      <button class="toggle-button ${on ? 'on' : ''}" type="button" data-sync-action="toggle" aria-pressed="${on}"><span></span><b>${on ? 'ON' : 'OFF'}</b></button></div>`;
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

  document.addEventListener('click', event => {
    const el = event.target.closest?.('[data-sync-action]');
    if(!el) return;
    event.preventDefault();
    if(el.dataset.syncAction === 'toggle') toggle();
  });

  const a = auth();
  if(a?.isEnabled?.()) {
    a.onChange?.(user => { if(user) autoEnable().then(() => syncNow()).catch(() => {}); });
    Promise.resolve(a.ready?.()).then(() => autoEnable()).then(() => syncNow()).catch(() => {});
  }
  window.addEventListener('online', () => syncNow());

  window.DECIDE_SYNC = Object.freeze({
    schedule,
    markDeleted,
    syncNow,
    renderToggle,
    isOn,
    autoEnable,
    _pure: { merge, isValidLog, stampOf }
  });
})();

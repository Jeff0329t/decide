// DECIDE. プッシュ通知（ログインした人だけ）
// アプリを閉じていても「あの決断、どうなった？」が届くように、サーバーから通知を送る（iPhone はホーム画面に追加したアプリで iOS 16.4 以降）。
// サーバーに送るのは「通知の宛先（購読情報）」と、ふり返り前のログの {id, remindAt} だけ。悩みや選択肢などログの中身は送らない。
// 通知の文面は決まった一文だけ。VAPID の公開鍵は config.js（公開してよい値）。秘密鍵はサーバー（Supabase Secrets）にだけ置く。
(function(){
  const STORE_KEY = 'decide.tarot.push.v1';
  const LOGS_KEY = 'decide.tarot.logs.v1';
  const MAX_ITEMS = 500;
  const MAX_ID = 100;

  const notify = message => { if(typeof toast === 'function') toast(message); };
  const auth = () => window.DECIDE_AUTH || null;
  const app = () => window.DECIDE_APP_BRIDGE || null;
  const nav = () => (typeof navigator !== 'undefined' ? navigator : null);
  const vapidKey = () => String(window.DECIDE_CONFIG?.VAPID_PUBLIC_KEY || '').trim();
  const loggedIn = () => !!(auth()?.getUser?.() && auth()?.client?.());
  const hasPush = () => typeof window.PushManager !== 'undefined' && !!nav()?.serviceWorker && typeof Notification !== 'undefined';
  const isIOSDevice = () => {
    const n = nav();
    if(!n) return false;
    return /iPad|iPhone|iPod/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
  };
  const standalone = () => {
    try { if(window.matchMedia?.('(display-mode: standalone)')?.matches) return true; } catch(error) {}
    return nav()?.standalone === true;
  };

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      return { enabled: raw.enabled === true, ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : '' };
    } catch(error) {
      return { enabled: false, ownerId: '' };
    }
  }
  let state = loadState();
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(error) {}
  }

  // 純粋関数（テスト用にも公開）
  // VAPID 公開鍵（base64url）→ Uint8Array
  function urlBase64ToUint8Array(value) {
    const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const raw = atob(padded);
    const out = new Uint8Array(raw.length);
    for(let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // サーバーに送る予定の形をそろえる（id と remindAt だけ・新しい順に最大500件）
  function sanitizeItems(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .filter(item => item && typeof item.id === 'string' && item.id && item.id.length <= MAX_ID && Number.isFinite(Date.parse(item.remindAt || '')))
      .map(item => ({ id: item.id, remindAt: new Date(Date.parse(item.remindAt)).toISOString() }))
      .filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)))
      .sort((a, b) => (a.remindAt < b.remindAt ? 1 : a.remindAt > b.remindAt ? -1 : 0))
      .slice(0, MAX_ITEMS);
  }

  // 状態の表示名（設定画面の「状態：」）
  function statusLabel(status) {
    return ({
      login: 'ログインが必要',
      'ios-home': 'ホーム画面への追加が必要',
      unsupported: 'この端末は非対応',
      denied: '通知がブロックされています',
      failed: '登録失敗',
      registered: '登録済み',
      off: 'OFF'
    })[status] || 'OFF';
  }

  // mode: 'ready'（ON/OFFできる）/ 'ios-home'（ホーム画面に追加してから）/ 'login'（ログインしてから）
  function settingHtml(on, mode, status = on ? 'registered' : 'off') {
    const title = '<b>閉じていても通知</b>';
    const state = `<p class="push-status" data-push-status>状態：${statusLabel(status)}</p>`;
    if(mode === 'ios-home') {
      return `<div class="feedback-setting push-setting" data-push-setting><div>${title}<p>Safariの共有ボタン→「ホーム画面に追加」してから開くと、通知を受け取れます（iOS 16.4以降）。</p>${state}</div></div>`;
    }
    if(mode === 'login') {
      return `<div class="feedback-setting push-setting" data-push-setting><div>${title}<p>アプリを閉じていても通知を受け取るには、ログインが必要です。</p>${state}</div></div>`;
    }
    return `<div class="feedback-setting push-setting" data-push-setting><div>${title}<p>アプリを閉じていても、決定ごとに選んだ日に届きます。サーバーに送るのは通知の予定日時だけで、決定の内容は送りません。</p>${state}</div>
      <button class="toggle-button ${on ? 'on' : ''}" type="button" aria-label="ふり返りの通知（アプリを閉じていても届く）" data-push-action="toggle" aria-pressed="${on}"><span></span><b>${on ? 'ON' : 'OFF'}</b></button></div>`;
  }

  function mode() {
    if(!vapidKey()) return '';
    if(!loggedIn()) return 'login';
    if(hasPush()) return 'ready';
    if(isIOSDevice() && !standalone()) return 'ios-home';
    return '';
  }

  const isOn = () => state.enabled && loggedIn() && hasPush() && !!vapidKey();

  let lastError = '';
  function status() {
    if(!vapidKey()) return '';
    if(!loggedIn()) return 'login';
    if(!hasPush()) return isIOSDevice() && !standalone() ? 'ios-home' : 'unsupported';
    if(typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied';
    if(lastError) return 'failed';
    return isOn() ? 'registered' : 'off';
  }

  function currentLogs() {
    const fromApp = app()?.getLogs?.();
    if(Array.isArray(fromApp)) return fromApp;
    try {
      const raw = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch(error) {
      return [];
    }
  }

  // この端末の通知の宛先（無ければ空文字）
  async function currentEndpoint() {
    const reg = await swRegistration();
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint || '';
  }

  // ふり返り前の予定をサーバーへ（この端末の宛先の分だけ置きかえる・前回と同じなら送らない・失敗したら60秒待つ）
  let lastSent = '';
  let failedAt = 0;
  let syncing = null;
  function syncReminders(force = false) {
    if(!isOn()) return Promise.resolve();
    if(syncing) return syncing;
    if(!force && failedAt && Date.now() - failedAt < 60000) return Promise.resolve();
    const pending = window.DECIDE_REMINDERS?._pure?.pendingItems;
    if(typeof pending !== 'function') return Promise.resolve();
    const items = sanitizeItems(pending(currentLogs()));
    const client = auth()?.client?.();
    syncing = (async () => {
      const endpoint = await currentEndpoint();
      if(!endpoint) return;
      const signature = JSON.stringify([endpoint, items]);
      if(!force && signature === lastSent) return;
      const { error } = (await client.rpc('set_push_reminders', { items, endpoint })) || {};
      if(error) { failedAt = Date.now(); lastError = 'failed'; return; }
      lastSent = signature;
      failedAt = 0;
      lastError = '';
    })()
      .catch(() => { failedAt = Date.now(); lastError = 'failed'; })
      .finally(() => { syncing = null; });
    return syncing;
  }

  // Service Worker の登録を待つ。ready は登録が無いと永遠に待つので、取得→時間切れ→登録し直しの順で必ず返す
  async function swRegistration() {
    const sw = nav()?.serviceWorker;
    if(!sw) throw new Error('sw-unavailable');
    try {
      const reg = await sw.getRegistration?.();
      if(reg?.active) return reg;
    } catch(error) {}
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 8000));
    const ready = await Promise.race([sw.ready, timeout]).catch(() => null);
    if(ready) return ready;
    try {
      await sw.register('./service-worker.js', { updateViaCache: 'none' });
      const again = await Promise.race([sw.ready, new Promise(resolve => setTimeout(() => resolve(null), 8000))]).catch(() => null);
      if(again) return again;
    } catch(error) {}
    throw new Error('sw-unavailable');
  }

  async function subscribe() {
    const reg = await swRegistration();
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey()) });
    const json = sub.toJSON ? sub.toJSON() : {};
    const keys = json.keys || {};
    if(!json.endpoint || !keys.p256dh || !keys.auth) throw new Error('bad subscription');
    const { error } = await auth().client().rpc('save_push_subscription', { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth });
    if(error) throw error;
  }

  async function unsubscribe() {
    try {
      const reg = await swRegistration();
      const sub = await reg.pushManager.getSubscription();
      if(!sub) return;
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      const client = auth()?.client?.();
      if(client) await client.rpc('delete_push_subscription', { endpoint });
    } catch(error) {
      // 端末側の購読は消えているので、サーバーの宛先は送信時の 404/410 で片付く
    }
  }

  let busy = false;
  function setBusy(on) {
    if(typeof document === 'undefined') return;
    document.querySelectorAll('[data-push-action="toggle"]').forEach(button => {
      button.classList.toggle('is-busy', on);
      button.setAttribute('aria-busy', String(on));
      const label = button.querySelector('b');
      if(label) label.textContent = on ? '…' : (isOn() ? 'ON' : 'OFF');
    });
  }
  function deniedMessage() {
    return isIOSDevice()
      ? '通知がブロックされています。iPhoneの「設定」→「通知」→「DECIDE.」で許可してからもう一度ONにしてください'
      : '通知がブロックされています。ブラウザのサイト設定で通知を許可してからもう一度ONにしてください';
  }
  async function toggle() {
    if(busy) { notify('切り替え中です。少し待ってください'); return; }
    const m = mode();
    if(m !== 'ready') {
      if(!loggedIn()) notify('アプリを閉じていても通知を受け取るには、ログインが必要です');
      else if(m === 'ios-home') notify('Safariの共有ボタン→「ホーム画面に追加」してから開いてください');
      else notify('この端末ではプッシュ通知を使えません');
      return;
    }
    busy = true;
    setBusy(true);
    try {
      if(state.enabled) {
        // OFF は端末側の状態をすぐに切り替え、サーバー側の後片付けは待つだけ
        state.enabled = false;
        state.ownerId = '';
        saveState();
        lastError = '';
        await unsubscribe();
        notify('プッシュ通知をOFFにしました');
        return;
      }
      if(Notification.permission === 'denied') { notify(deniedMessage()); return; }
      let permission = Notification.permission;
      try {
        if(permission !== 'granted') permission = await Notification.requestPermission();
      } catch(error) {
        permission = 'denied';
      }
      if(permission !== 'granted') { notify(permission === 'denied' ? deniedMessage() : '通知が許可されませんでした'); return; }
      try {
        await subscribe();
      } catch(error) {
        lastError = 'failed';
        notify(error?.message === 'sw-unavailable'
          ? '通知の準備ができていません。アプリを一度閉じて開き直してから試してください'
          : '通知の登録ができませんでした。通信状態を確かめて、時間をおいて試してください');
        return;
      }
      lastError = '';
      state.enabled = true;
      state.ownerId = auth()?.getUser?.()?.id || '';
      saveState();
      lastSent = '';
      await syncReminders(true);
      notify('プッシュ通知をONにしました');
    } finally {
      busy = false;
      setBusy(false);
      refreshSection();
    }
  }

  // 設定画面
  function renderSettings() {
    const m = mode();
    return m ? settingHtml(isOn(), m, status()) : '';
  }

  function mountSettings(wrap) {
    if(!wrap?.querySelector) return;
    const html = renderSettings();
    const old = wrap.querySelector('[data-push-setting]');
    if(old) { if(html) old.outerHTML = html; else old.remove(); return; }
    if(!html) return;
    const anchor = wrap.querySelector('[data-remind-setting]');
    if(anchor) anchor.insertAdjacentHTML('afterend', html);
  }

  function refreshSection() {
    if(typeof document === 'undefined') return;
    const wrap = document.querySelector('#settings-modal');
    if(wrap) mountSettings(wrap);
  }

  if(typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      const el = event.target.closest?.('[data-push-action]');
      if(!el) return;
      event.preventDefault();
      if(el.dataset.pushAction === 'toggle') toggle();
    });
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') syncReminders(); });
  }
  window.addEventListener?.('pagehide', () => syncReminders());

  // ログアウトの前に呼ぶ：この端末の宛先をサーバーから消して（予定も一緒に消える）、端末側の購読も止める
  async function disableForSignOut() {
    if(!state.enabled) return;
    state.enabled = false;
    state.ownerId = '';
    saveState();
    lastSent = '';
    await unsubscribe();
    refreshSection();
  }

  // 前と別のアカウントでログインしたら、前の人の宛先で通知が続かないよう、この端末の通知を止める。
  // サーバー側の古い宛先は、ログイン中の人のものではないので消せない。端末側の購読を止めれば送信時の 404/410 で片付く。
  // 戻り値: 同期を続けてよいか
  async function checkOwner(user) {
    if(!user || !state.enabled) return true;
    if(!state.ownerId) { state.ownerId = user.id; saveState(); return true; }
    if(state.ownerId === user.id) return true;
    state.enabled = false;
    state.ownerId = '';
    saveState();
    lastSent = '';
    try {
      const reg = await swRegistration();
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe?.().catch(() => {});
    } catch(error) {}
    refreshSection();
    notify('別のアカウントでログインしたため、この端末のプッシュ通知をOFFにしました。必要なら設定からONにしてください');
    return false;
  }

  auth()?.onChange?.(user => {
    lastSent = '';
    failedAt = 0;
    lastError = '';
    refreshSection();
    if(user) checkOwner(user).then(ok => { if(ok) syncReminders(); });
  });
  auth()?.ready?.()?.then?.(user => { if(user) checkOwner(user).then(ok => { if(ok) syncReminders(); }); });

  window.DECIDE_PUSH = Object.freeze({
    isOn,
    renderSettings,
    mountSettings,
    syncNow: () => syncReminders(true),
    toggle,
    disableForSignOut,
    _pure: { urlBase64ToUint8Array, sanitizeItems, settingHtml, statusLabel }
  });
})();

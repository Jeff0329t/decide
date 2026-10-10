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
      return { enabled: raw.enabled === true };
    } catch(error) {
      return { enabled: false };
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

  // mode: 'ready'（ON/OFFできる）/ 'ios-home'（ホーム画面に追加してから）
  function settingHtml(on, mode) {
    if(mode === 'ios-home') {
      return `<div class="feedback-setting push-setting" data-push-setting><div><b>アプリを閉じていても通知</b><p>Safariの共有ボタン→「ホーム画面に追加」してから開くと、通知を受け取れます（iOS 16.4以降）。</p></div></div>`;
    }
    return `<div class="feedback-setting push-setting" data-push-setting><div><b>アプリを閉じていても通知</b><p>ONにすると、アプリを閉じていても決定ごとに選んだ日に「あの決断、どうなった？」と届きます。サーバーに送るのは通知の予定日時だけで、決定の内容は送りません。</p></div>
      <button class="toggle-button ${on ? 'on' : ''}" type="button" data-push-action="toggle" aria-pressed="${on}"><span></span><b>${on ? 'ON' : 'OFF'}</b></button></div>`;
  }

  function mode() {
    if(!loggedIn() || !vapidKey()) return '';
    if(hasPush()) return 'ready';
    if(isIOSDevice() && !standalone()) return 'ios-home';
    return '';
  }

  const isOn = () => state.enabled && loggedIn() && hasPush() && !!vapidKey();

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

  // ふり返り前の予定をサーバーへ（前回と同じなら送らない・失敗したら60秒待つ）
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
    const signature = JSON.stringify(items);
    if(!force && signature === lastSent) return Promise.resolve();
    const client = auth()?.client?.();
    syncing = Promise.resolve(client.rpc('set_push_reminders', { items }))
      .then(({ error } = {}) => {
        if(error) { failedAt = Date.now(); return; }
        lastSent = signature;
        failedAt = 0;
      })
      .catch(() => { failedAt = Date.now(); })
      .finally(() => { syncing = null; });
    return syncing;
  }

  async function subscribe() {
    const reg = await nav().serviceWorker.ready;
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
      const reg = await nav().serviceWorker.ready;
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
  async function toggle() {
    if(busy || mode() !== 'ready') return;
    busy = true;
    try {
      if(state.enabled) {
        state.enabled = false;
        saveState();
        refreshSection();
        await unsubscribe();
        notify('プッシュ通知をOFFにしました');
        return;
      }
      let permission = Notification.permission;
      try {
        if(permission !== 'granted') permission = await Notification.requestPermission();
      } catch(error) {
        permission = 'denied';
      }
      if(permission !== 'granted') { notify('通知が許可されませんでした'); return; }
      try {
        await subscribe();
      } catch(error) {
        notify('通知の登録ができませんでした。時間をおいて試してください');
        return;
      }
      state.enabled = true;
      saveState();
      refreshSection();
      lastSent = '';
      await syncReminders(true);
      notify('プッシュ通知をONにしました');
    } finally {
      busy = false;
    }
  }

  // 設定画面
  function renderSettings() {
    const m = mode();
    return m ? settingHtml(isOn(), m) : '';
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

  auth()?.onChange?.(user => {
    lastSent = '';
    failedAt = 0;
    refreshSection();
    if(user) syncReminders();
  });
  auth()?.ready?.()?.then?.(user => { if(user) syncReminders(); });

  window.DECIDE_PUSH = Object.freeze({
    isOn,
    renderSettings,
    mountSettings,
    syncNow: () => syncReminders(true),
    toggle,
    _pure: { urlBase64ToUint8Array, sanitizeItems, settingHtml }
  });
})();

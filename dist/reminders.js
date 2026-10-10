// DECIDE. ふり返りの通知（設定でONにした人だけ）
// ONのとき、新しい決定ログに「3日後にふり返る」予定（remindAt）を付ける。いつ聞くかは決定ごとに履歴の詳細から変えられる。
// ふり返り前のログの {id, remindAt} だけを IndexedDB にコピーし、Service Worker が定期バックグラウンド同期で通知する。
// 通知の文面は決まった一文だけで、ログの中身（悩みや選択肢）は通知に出さない。
(function(){
  const STORE_KEY = 'decide.tarot.remind.v1';
  const LOGS_KEY = 'decide.tarot.logs.v1';
  const DB_NAME = 'decide-remind';
  const DB_STORE = 'items';
  const SYNC_TAG = 'decide-remind';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_DAYS = 3;
  const MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

  const notify = message => { if(typeof toast === 'function') toast(message); };
  const app = () => window.DECIDE_APP_BRIDGE || null;
  const hasNotification = () => typeof Notification !== 'undefined';
  const hasIdb = () => typeof indexedDB !== 'undefined' && !!indexedDB;
  const swContainer = () => (typeof navigator !== 'undefined' && navigator.serviceWorker) || null;

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const notified = Array.isArray(raw.notified) ? raw.notified.filter(id => typeof id === 'string' && id) : [];
      return { enabled: raw.enabled === true, notified: [...new Set(notified)] };
    } catch(error) {
      return { enabled: false, notified: [] };
    }
  }
  let state = loadState();
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(error) {}
  }

  // 純粋関数（テスト用にも公開）
  const timeOf = value => { const t = Date.parse(value || ''); return Number.isFinite(t) ? t : NaN; };

  // 新しいログの remindAt。OFF・日時が壊れているときは null
  function defaultRemindAt(createdAt, enabled = state.enabled) {
    if(!enabled) return null;
    const t = timeOf(createdAt);
    return Number.isFinite(t) ? new Date(t + DEFAULT_DAYS * DAY_MS).toISOString() : null;
  }

  // ふり返り前・予定時刻を過ぎた・まだ通知していないログ → [{id, remindAt}]
  function dueItems(logs, now, notified) {
    const done = new Set(notified || []);
    const limit = typeof now === 'number' ? now : timeOf(now);
    return pendingItems(logs).filter(item => timeOf(item.remindAt) <= limit && !done.has(item.id));
  }

  // ふり返り前で予定のあるログ → [{id, remindAt}]（IndexedDB に入れるのはこれだけ）
  function pendingItems(logs) {
    return (Array.isArray(logs) ? logs : [])
      .filter(log => log && typeof log.id === 'string' && log.id && !log.review && Number.isFinite(timeOf(log.remindAt)))
      .map(log => ({ id: log.id, remindAt: log.remindAt }));
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

  // IndexedDB（Service Worker と共有）
  function openDb() {
    return new Promise((resolve, reject) => {
      if(!hasIdb()) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if(!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function writeItems(items) {
    const db = await openDb();
    try {
      // Service Worker が通知済みにした印を引き継ぐ
      const existing = await new Promise((resolve, reject) => {
        const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      const swNotified = existing.filter(item => item && item.notified).map(item => item.id);
      const ids = new Set(items.map(item => item.id));
      state.notified = [...new Set([...state.notified, ...swNotified])].filter(id => ids.has(id));
      saveState();
      const done = new Set(state.notified);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        store.clear();
        items.forEach(item => store.put({ id: item.id, remindAt: item.remindAt, notified: done.has(item.id) }));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  function syncToDb() {
    if(!hasIdb()) return Promise.resolve();
    const items = state.enabled ? pendingItems(currentLogs()) : [];
    return writeItems(items).catch(() => {});
  }

  // ready は Service Worker の登録が無いと永遠に待つので、時間切れで必ず抜ける
  function swReady() {
    const sw = swContainer();
    if(!sw?.ready) return Promise.resolve(null);
    return Promise.race([sw.ready, new Promise(resolve => setTimeout(() => resolve(null), 8000))]).catch(() => null);
  }

  function registerPeriodic() {
    return swReady()
      .then(reg => reg?.periodicSync?.register?.(SYNC_TAG, { minInterval: MIN_INTERVAL_MS }))
      .catch(() => {});
  }

  function unregisterPeriodic() {
    return swReady()
      .then(reg => reg?.periodicSync?.unregister?.(SYNC_TAG))
      .catch(() => {});
  }

  // 設定画面
  function renderToggle() {
    const on = state.enabled;
    const supported = hasNotification();
    const note = supported
      ? `ONにすると、決定ごとに選んだ日に「あの決断、どうなった？」と通知します。通知に決定の内容は出ません。アプリを閉じている間も届けるには、iPhoneはSafariの共有ボタンから「ホーム画面に追加」したアプリで開いてください（iOS 16.4以降）。`
      : 'この端末・ブラウザは通知に対応していません。アプリを開いたときのお知らせは、これまで通り表示されます。';
    return `<div class="feedback-setting remind-setting" data-remind-setting><div><b>ふり返りの通知</b><p>${note}</p></div>
      <button class="toggle-button ${on ? 'on' : ''}" type="button" data-remind-action="toggle" aria-pressed="${on}"><span></span><b>${on ? 'ON' : 'OFF'}</b></button></div>`;
  }

  function mountSettings(wrap) {
    if(!wrap?.querySelector) return;
    const old = wrap.querySelector('[data-remind-setting]');
    if(old) { old.outerHTML = renderToggle(); return; }
    const anchor = wrap.querySelector('[data-action="toggle-feedback"]')?.closest?.('.feedback-setting');
    if(anchor) anchor.insertAdjacentHTML('afterend', renderToggle());
  }

  function refreshSettings() {
    const wrap = typeof document !== 'undefined' ? document.querySelector('#settings-modal') : null;
    if(wrap) { mountSettings(wrap); window.DECIDE_PUSH?.mountSettings?.(wrap); }
  }

  const isIOSDevice = () => {
    const n = typeof navigator !== 'undefined' ? navigator : null;
    return !!n && (/iPad|iPhone|iPod/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1));
  };
  function deniedMessage() {
    return isIOSDevice()
      ? '通知がブロックされています。iPhoneの「設定」→「通知」→「DECIDE.」で許可してからもう一度ONにしてください'
      : '通知がブロックされています。ブラウザのサイト設定で通知を許可してからもう一度ONにしてください';
  }

  // 切り替えは画面とトーストをすぐに反映し、端末内の予定の書き込みは後ろで進める
  let busy = false;
  async function toggle() {
    if(busy) { notify('切り替え中です。少し待ってください'); return; }
    if(state.enabled) {
      state.enabled = false;
      saveState();
      refreshSettings();
      notify('ふり返りの通知をOFFにしました');
      syncToDb();
      unregisterPeriodic();
      return;
    }
    if(!hasNotification()) { notify('この端末では通知を使えません'); return; }
    if(Notification.permission === 'denied') { notify(deniedMessage()); return; }
    busy = true;
    let permission = Notification.permission;
    try {
      if(permission !== 'granted') permission = await Notification.requestPermission();
    } catch(error) {
      permission = 'denied';
    } finally {
      busy = false;
    }
    if(permission !== 'granted') { notify(permission === 'denied' ? deniedMessage() : '通知が許可されませんでした'); return; }
    state.enabled = true;
    saveState();
    refreshSettings();
    notify('ふり返りの通知をONにしました');
    syncToDb();
    registerPeriodic();
  }

  if(typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      const el = event.target.closest?.('[data-remind-action]');
      if(!el) return;
      event.preventDefault();
      if(el.dataset.remindAction === 'toggle') toggle();
    });
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') syncToDb(); });
  }
  window.addEventListener?.('pagehide', () => syncToDb());
  if(state.enabled) { syncToDb(); registerPeriodic(); }

  window.DECIDE_REMINDERS = Object.freeze({
    isOn: () => state.enabled,
    defaultRemindAt: createdAt => defaultRemindAt(createdAt, state.enabled || window.DECIDE_PUSH?.isOn?.() === true),
    mountSettings,
    renderToggle,
    syncNow: syncToDb,
    toggle,
    _pure: { dueItems, defaultRemindAt, pendingItems }
  });
})();

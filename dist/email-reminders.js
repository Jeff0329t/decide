// メール通知は端末ごとの明示的な同意で登録する。題名を案内に使う。メモや選択肢は送らない。
(function(){
  const KEY = 'decide.emailReminders.device.v1';
  const auth = () => window.DECIDE_AUTH;
  const available = () => window.DECIDE_CONFIG?.EMAIL_REMINDERS_ENABLED === true;
  let device = '';
  function bindDevice(userId) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      device = saved.owner === userId && /^[0-9a-f-]{36}$/i.test(saved.id || '') ? saved.id : crypto.randomUUID();
      localStorage.setItem(KEY, JSON.stringify({ owner: userId, id: device }));
    } catch { device = ''; }
  }
  let owner = '', enabled = false, loaded = false, busy = false, error = '', epoch = 0;
  let timer, retryTimer, lastSent = '', queue = Promise.resolve();
  const notify = text => { if(typeof toast === 'function') toast(text); };
  const escape = text => String(text || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isOn = () => available() && loaded && enabled && owner === auth()?.getUser?.()?.id;
  function items() {
    const logs = window.DECIDE_APP_BRIDGE?.getLogs?.() || [];
    const pending = logs.filter(log => log && typeof log.id === 'string' && log.id.length > 0 && log.id.length <= 100 && !log.review && Number.isFinite(Date.parse(log.remindAt)));
    if(pending.length > 500) throw new Error('too-many-logs');
    return pending
      .map(log => ({ id: log.id, remindAt: new Date(log.remindAt).toISOString(), title: String(log.title || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0,60) }))
      .sort((a,b) => a.id.localeCompare(b.id));
  }
  // Serialize snapshots so an older request cannot restore a canceled reminder.
  function serialize(fn) {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  }
  function schedule(delay = 300) {
    clearTimeout(timer);
    if(isOn()) timer = setTimeout(() => { syncNow(); }, delay);
  }
  function syncNow() {
    const generation = epoch;
    return serialize(async () => {
      if(generation !== epoch || !isOn()) return false;
      try {
        const next = items(), signature = JSON.stringify(next);
        if(signature === lastSent) return true;
        const { error: failure } = await auth().client().rpc('set_email_reminders', { device, enabled: true, items: next });
        if(failure) throw failure;
        if(generation !== epoch) return false;
        lastSent = signature; error = '';
        clearTimeout(retryTimer);
        return true;
      } catch {
        if(generation === epoch) {
          error = '予定を登録できませんでした。通信が戻ると再試行します。';
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => { syncNow(); }, 60000);
        }
        return false;
      } finally { refresh(); }
    });
  }
  async function loadUser(user) {
    const generation = ++epoch;
    clearTimeout(timer); clearTimeout(retryTimer);
    owner = user?.id || ''; enabled = false; loaded = false; error = ''; lastSent = '';
    if(available() && user) bindDevice(user.id);
    refresh();
    if(!available() || !user || !device) return;
    try {
      await queue;
      if(generation !== epoch) return;
      const { data, error: failure } = await auth().client().rpc('get_email_reminder_setting', { device });
      if(failure) throw failure;
      if(generation !== epoch) return;
      enabled = data === true; loaded = true;
      if(enabled) schedule();
    } catch {
      if(generation === epoch) error = '設定を確認できませんでした。再試行してください。';
    }
    refresh();
  }
  async function toggle() {
    if(busy || !loaded || !available() || !owner) return;
    busy = true; clearTimeout(timer); refresh();
    const generation = epoch, next = !enabled;
    try {
      await serialize(async () => {
        if(generation !== epoch) return;
        const snapshot = next ? items() : [];
        const { error: failure } = await auth().client().rpc('set_email_reminders', { device, enabled: next, items: snapshot });
        if(failure) throw failure;
        if(generation !== epoch) return;
        enabled = next; error = ''; lastSent = JSON.stringify(snapshot);
        clearTimeout(retryTimer);
        notify(next ? 'メールでリマインドをONにしました' : 'メールでリマインドをOFFにしました');
      });
    } catch {
      if(generation === epoch) {
        error = '変更を保存できませんでした。もう一度お試しください。';
        notify(error);
      }
    } finally { busy = false; refresh(); schedule(); }
  }
  // Sign-out waits for cancellation. Never claim OFF while the server still has schedules.
  async function disableForSignOut() {
    if(!available() || !owner || !device) return true;
    if(busy) { notify('メール通知の設定を変更中です。少し待ってください'); return false; }
    if(loaded && !enabled) return true;
    busy = true; clearTimeout(timer); clearTimeout(retryTimer); refresh();
    try {
      await serialize(async () => {
        const { error: failure } = await auth().client().rpc('set_email_reminders', { device, enabled: false, items: [] });
        if(failure) throw failure;
      });
      enabled = false; lastSent = ''; return true;
    } catch {
      notify('メール通知を停止できませんでした。通信を確認して、もう一度ログアウトしてください');
      return false;
    } finally { busy = false; refresh(); }
  }
  function renderSettings() {
    const user = auth()?.getUser?.();
    let note = !available() ? '準備中です。メール配信の設定が完了すると使えます。'
      : !user ? 'Googleでログインすると、メールで受け取れます。'
      : !device ? '端末への設定の保存を許可してください。'
      : !loaded ? error || '設定を確認しています…'
      : `この端末で選んだ日に、${escape(user.email)} へ、記録の題名を添えて送ります。題名は配信用に保存します。題名以外の記録は載せません。`;
    return `<div class="feedback-setting email-remind-setting" data-email-remind-setting><div><b>メールでリマインド</b><p>${note}</p>${loaded && error ? `<p role="status">${escape(error)}</p>` : ''}${user && available() && error ? '<button type="button" class="text-button" data-email-remind-action="retry">再試行</button>' : ''}</div>${loaded ? `<button class="toggle-button ${isOn()?'on':''}" type="button" aria-label="メールでリマインド" data-email-remind-action="toggle" aria-pressed="${isOn()}" ${busy?'disabled aria-busy="true"':''}><span></span><b>${busy?'…':isOn()?'ON':'OFF'}</b></button>`:''}</div>`;
  }
  function mountSettings(wrap) {
    const old = wrap?.querySelector?.('[data-email-remind-setting]');
    if(old) { old.outerHTML = renderSettings(); return; }
    const anchor = wrap?.querySelector?.('[data-push-setting]') || wrap?.querySelector?.('[data-remind-setting]');
    anchor?.insertAdjacentHTML('afterend', renderSettings());
  }
  function refresh() { if(typeof document !== 'undefined') mountSettings(document.querySelector('#settings-modal')); }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-email-remind-action]');
    if(!button) return;
    event.preventDefault();
    if(button.dataset.emailRemindAction === 'toggle') toggle();
    if(button.dataset.emailRemindAction === 'retry') { if(loaded) syncNow(); else loadUser(auth()?.getUser?.()); }
  });
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') loadUser(auth()?.getUser?.()); });
  window.addEventListener?.('online', () => { if(loaded) syncNow(); else loadUser(auth()?.getUser?.()); });
  auth()?.onChange?.(loadUser);
  auth()?.ready?.()?.then?.(loadUser);
  window.DECIDE_EMAIL_REMINDERS = Object.freeze({ isOn, renderSettings, mountSettings, schedule, syncNow, toggle, disableForSignOut });
})();

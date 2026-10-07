// DECIDE. ログイン（Supabase Google OAuth）
// 決定ログ本文は、PROで「ログの同期」をONにした場合だけ送信する（sync.js）。それ以外でSupabaseに渡るのはメール等のアカウント情報のみ。
(function(){
  const config = window.DECIDE_CONFIG || {};
  const PROMPT_AT_SAVE = 5;
  const listeners = new Set();
  let client = null;
  let currentUser = null;
  let ready = Promise.resolve(null);

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const notify = message => { if(typeof toast === 'function') toast(message); };

  function isEnabled() {
    return Boolean(client);
  }

  function init() {
    if(!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY || !window.supabase?.createClient) return;
    try {
      client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
      });
    } catch(error) {
      client = null;
      return;
    }
    ready = client.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user || null);
      return currentUser;
    }).catch(() => null);
    client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
  }

  function setUser(user) {
    const prevId = currentUser?.id || null;
    currentUser = user ? { id: user.id, email: user.email || '' } : null;
    if(prevId === (currentUser?.id || null)) return;
    listeners.forEach(fn => { try { fn(currentUser); } catch(error) {} });
    refreshOpenSettings();
  }

  function getUser() {
    return currentUser;
  }

  function onChange(fn) {
    if(typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function redirectUrl() {
    return location.origin + location.pathname;
  }

  async function signInWithGoogle() {
    if(!client) { notify('ログインは準備中です'); return; }
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
    if(error) notify('ログインを開始できませんでした');
  }

  async function signOut() {
    if(!client) return;
    await client.auth.signOut().catch(() => {});
    setUser(null);
    notify('ログアウトしました');
  }

  async function accessToken() {
    if(!client) return '';
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || '';
  }

  async function deleteAccount() {
    const token = await accessToken();
    if(!token) { notify('ログインし直してください'); return false; }
    try {
      const res = await fetch(`${config.SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: '{}'
      });
      if(!res.ok) throw new Error(String(res.status));
    } catch(error) {
      notify('アカウントを削除できませんでした');
      return false;
    }
    await client.auth.signOut().catch(() => {});
    setUser(null);
    notify('アカウントを削除しました');
    return true;
  }

  // 設定画面のアカウント欄
  function renderSettings(wrap) {
    const section = wrap?.querySelector('[data-account-setting]');
    if(!section) return;
    if(!client) { section.hidden = true; return; }
    section.hidden = false;
    const user = currentUser;
    section.innerHTML = user
      ? `<div><b id="account-setting-title">アカウント</b>
        <p class="account-email">${escapeHtml(user.email)} でログイン中</p></div>
        ${window.DECIDE_SYNC?.renderToggle?.() || ''}
        ${window.DECIDE_REFERRAL?.renderSettings?.() || ''}
        <div class="data-actions">
          <button class="button secondary" type="button" data-auth-action="logout">ログアウト</button>
          <button class="button secondary danger" type="button" data-auth-action="delete-confirm">アカウント削除</button>
        </div>`
      : `<div><b id="account-setting-title">アカウント</b>
        <p>Googleでログインすると、PRO（購入済みの状態）を別の端末でも使えます。決定ログの本文は、PROで同期をONにしない限り送信されず、この端末に残ります。</p></div>
        <div class="data-actions">
          <button class="button" type="button" data-auth-action="login">ログイン</button>
        </div>`;
  }

  function refreshOpenSettings() {
    const wrap = document.querySelector('#settings-modal');
    if(wrap) renderSettings(wrap);
  }

  function openSheet(id, title, body, actions) {
    if(document.querySelector(`#${id}`)) return;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.id = id;
    wrap.innerHTML = `<button class="modal-shade" type="button" data-auth-action="close" aria-label="閉じる"></button>
      <section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="sheet-handle" aria-hidden="true"></div>
        <div class="sheet-head"><h2 id="${id}-title">${title}</h2><button type="button" data-auth-action="close" aria-label="閉じる">×</button></div>
        ${body}
        <div class="confirm-actions">${actions}</div>
      </section>`;
    if(typeof mountModal === 'function') mountModal(wrap, '.confirm-actions button');
    else document.body.appendChild(wrap);
  }

  function closeSheet(id) {
    if(typeof closeModal === 'function') closeModal(`#${id}`);
    else document.querySelector(`#${id}`)?.remove();
  }

  // 5件目の保存でログインを案内（閉じられる・ブロックしない）
  function maybePromptAfterSave(count, isNew) {
    if(!client || currentUser || !isNew || count !== PROMPT_AT_SAVE) return;
    openLoginPrompt();
  }

  function openLoginPrompt(message) {
    if(!client) { notify('ログインは準備中です'); return; }
    openSheet('auth-login-modal', 'Googleでログインして記録を引き継ぐ',
      `<p>${escapeHtml(message || 'ログインしておくと、PROの購入状態を別の端末でも引き継げます。決定ログの本文は、PROで同期をONにしない限り送信されず、この端末に保存されたままです。')}</p>`,
      `<button class="button" type="button" data-auth-action="login">Googleでログイン</button>
       <button class="button secondary" type="button" data-auth-action="close">あとで</button>`);
  }

  function openDeleteConfirm() {
    if(typeof closeModal === 'function') closeModal('#settings-modal');
    setTimeout(() => openSheet('auth-delete-modal', 'アカウントを削除しますか？',
      `<p>ログイン情報・PROの購入状態・同期した決定ログをサーバーから削除します。この操作は取り消せません。</p>
       <p>この端末に保存された決定ログは削除されません（必要なら設定の「すべて削除」から消せます）。</p>`,
      `<button class="button danger" type="button" data-auth-action="delete">削除する</button>
       <button class="button secondary" type="button" data-auth-action="close">やめる</button>`), 200);
  }

  document.addEventListener('click', async event => {
    const target = event.target.closest?.('[data-auth-action]');
    if(!target) return;
    const action = target.dataset.authAction;
    const modal = target.closest('.modal-wrap');
    if(action === 'close') { if(modal) closeSheet(modal.id); return; }
    if(action === 'login') { await signInWithGoogle(); return; }
    if(action === 'logout') { await signOut(); return; }
    if(action === 'delete-confirm') { openDeleteConfirm(); return; }
    if(action === 'delete') {
      target.disabled = true;
      const ok = await deleteAccount();
      target.disabled = false;
      if(ok && modal) closeSheet(modal.id);
    }
  });

  init();

  window.DECIDE_AUTH = Object.freeze({
    isEnabled,
    ready: () => ready,
    getUser,
    onChange,
    signInWithGoogle,
    signOut,
    accessToken,
    deleteAccount,
    renderSettings,
    maybePromptAfterSave,
    openLoginPrompt,
    client: () => client
  });
})();

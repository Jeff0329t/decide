// DECIDE. ログイン（Google Identity Services の IDトークン → Supabase signInWithIdToken）
// GISは「Google でログイン」ボタンを押したときだけ読み込む（画面表示だけではGoogleへ通信しない）。
// GOOGLE_CLIENT_ID 未設定・GISが読めない・One Tapを表示できない場合は signInWithOAuth リダイレクトにフォールバックする。
// 決定ログ本文は、PROで「ログの同期」をONにした場合だけ送信する（sync.js）。それ以外でSupabaseに渡るのはメール等のアカウント情報のみ。
(function(){
  const config = window.DECIDE_CONFIG || {};
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

  function googleClientId() {
    return String(config.GOOGLE_CLIENT_ID || '').trim();
  }

  // GISスクリプトはログインボタンを押したときだけ読み込む（設定やUNLIMITED案内を開いただけではGoogleに接続しない）
  const GIS_SRC = 'https://accounts.google.com/gsi/client';
  let gisFailed = false;
  function loadGis() {
    if(window.google?.accounts?.id || document.querySelector(`script[src="${GIS_SRC}"]`)) return;
    gisFailed = false;
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    // 読み込めなかったらタグを外し、次の操作で読み直せるようにする
    script.onerror = () => { gisFailed = true; script.remove(); };
    document.head.appendChild(script);
  }

  function waitForGis(timeout = 8000) {
    loadGis();
    return new Promise(resolve => {
      const started = Date.now();
      (function check() {
        if(window.google?.accounts?.id) return resolve(window.google.accounts.id);
        if(gisFailed || Date.now() - started >= timeout) return resolve(null);
        setTimeout(check, 100);
      })();
    });
  }

  function randomNonce() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  // 以前はここでGoogle製ボタン（GIS）を描画していたが、描画のためにGISを読み込むと
  // 画面を開いただけでGoogleへ通信してしまう。互換のため関数は残し、何も読み込まずに false を返す
  // （呼び出し側は自前の「Googleでログイン」ボタンをそのまま使う）。
  async function renderGoogleButton(container) {
    if(container) container.hidden = true;
    return false;
  }

  // 自前ボタンの読み込み中表示
  const LOGIN_LABEL = 'Google でログイン';
  function setLoginBusy(busy) {
    document.querySelectorAll('[data-auth-action="login"], [data-ent-action="login"]').forEach(button => {
      button.disabled = busy;
      if(busy) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
      const label = button.querySelector('[data-login-label]');
      if(label) label.textContent = busy ? 'Google に接続中…' : LOGIN_LABEL;
    });
  }

  async function signInWithRedirect() {
    if(!client) { notify('ログインは準備中です'); return; }
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
    if(error) notify('ログインを開始できませんでした');
  }

  // ボタン1回で始まるログイン：GISを読み込み → One Tap（FedCM）のアカウント選択を表示。
  // Googleにはnonceのハッシュを渡し、Supabaseには生のnonceを渡す（Supabase側で照合）。
  // 選択画面を出せない（未ログイン・抑止中・ブラウザ非対応など）ときは、そのままリダイレクト方式へ進む。
  // 利用者自身が閉じた場合はリダイレクトしない（ボタンを押し直せば再表示、抑止中ならリダイレクト）。
  async function promptGoogle(gis) {
    const nonce = randomNonce();
    const hashedNonce = await sha256Hex(nonce);
    gis.initialize({
      client_id: googleClientId(),
      nonce: hashedNonce,
      use_fedcm_for_prompt: true,
      itp_support: true,
      auto_select: false,
      callback: async response => {
        const { error } = await client.auth.signInWithIdToken({ provider: 'google', token: response.credential, nonce });
        if(error) { notify('ログインできませんでした'); return; }
        if(document.querySelector('#paywall-modal')) closeSheet('paywall-modal');
        notify('ログインしました');
      }
    });
    return new Promise(resolve => {
      let settled = false;
      const done = value => { if(!settled) { settled = true; resolve(value); } };
      // FedCMでは「表示された」通知が来ないため、少し待って読み込み中表示だけ解除する
      const timer = setTimeout(() => done('shown'), 2500);
      gis.prompt(moment => {
        if(moment?.isNotDisplayed?.()) { clearTimeout(timer); done('unavailable'); return; }
        if(moment?.isSkippedMoment?.()) {
          const reason = moment.getSkippedReason?.();
          clearTimeout(timer);
          if(reason === 'user_cancel' || reason === 'tap_outside') { done('cancelled'); return; }
          if(settled) signInWithRedirect(); else done('unavailable');
          return;
        }
        if(moment?.isDismissedMoment?.() || moment?.isDisplayed?.()) { clearTimeout(timer); done('shown'); }
      });
    });
  }

  let signInBusy = false;
  async function signInWithGoogle() {
    if(!client) { notify('ログインは準備中です'); return; }
    if(signInBusy) return;
    // クライアントID未設定などGISを使えない環境は、従来のリダイレクト方式
    if(!googleClientId() || !window.crypto?.subtle) { await signInWithRedirect(); return; }
    signInBusy = true;
    setLoginBusy(true);
    try {
      const gis = await waitForGis();
      const result = gis ? await promptGoogle(gis) : 'unavailable';
      if(result === 'unavailable') await signInWithRedirect();
    } catch(error) {
      await signInWithRedirect();
    } finally {
      signInBusy = false;
      setLoginBusy(false);
    }
  }

  async function signOut() {
    if(!client) return;
    // セッションが残っているうちに、この端末の通知の宛先をサーバーから外す
    try { await window.DECIDE_PUSH?.disableForSignOut?.(); } catch(error) {}
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
    try { await window.DECIDE_PUSH?.disableForSignOut?.(); } catch(error) {}
    await client.auth.signOut().catch(() => {});
    setUser(null);
    notify('アカウントを削除しました');
    return true;
  }

  // 設定画面のアカウント欄
  function planLabel(user) {
    const ent = window.DECIDE_ENTITLEMENTS;
    if(ent?.hasPurchased?.(user)) return 'UNLIMITED EDITION（買い切り）';
    const until = Date.parse(ent?.proUntil?.(user) || '');
    if(Number.isFinite(until)) {
      const d = new Date(until);
      return `UNLIMITED（招待特典・${d.getMonth() + 1}/${d.getDate()}まで）`;
    }
    return '無料';
  }
  // Googleの「G」マーク（インラインSVG。外部への読み込みは発生しない）
  const GOOGLE_G_ICON = `<span class="google-login-mark" aria-hidden="true"><svg viewBox="0 0 48 48" width="18" height="18" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>`;
  function renderSettings(wrap) {
    const section = wrap?.querySelector('[data-account-setting]');
    if(!section) return;
    if(!client) { section.hidden = true; return; }
    section.hidden = false;
    const user = currentUser;
    section.innerHTML = user
      ? `<div><b id="account-setting-title">アカウント</b>
        <p class="account-email">${escapeHtml(user.email)} でログイン中</p>
        <p class="account-plan">プラン：${planLabel(user)}</p></div>
        <div class="data-actions">
          <button class="button secondary" type="button" data-auth-action="logout">ログアウト</button>
          <button class="button secondary danger" type="button" data-auth-action="delete-confirm">アカウント削除</button>
        </div>
        ${window.DECIDE_SYNC?.renderToggle?.() || ''}
        ${window.DECIDE_REFERRAL?.renderSettings?.() || ''}`
      : `<div><b id="account-setting-title">アカウント</b>
        <p>Googleでログインすると、UNLIMITED EDITION（購入済みの状態）を別の端末でも使えます。決定ログの本文は、UNLIMITED EDITIONで同期をONにしない限り送信されず、この端末に残ります。</p></div>
        <div class="data-actions">
          <button class="button google-login" type="button" data-auth-action="login">${GOOGLE_G_ICON}<span data-login-label>${LOGIN_LABEL}</span></button>
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

  function openDeleteConfirm() {
    if(typeof closeModal === 'function') closeModal('#settings-modal');
    setTimeout(() => openSheet('auth-delete-modal', 'アカウントを削除しますか？',
      `<p>ログイン情報・UNLIMITED EDITIONの購入状態・同期した決定ログをサーバーから削除します。この操作は取り消せません。</p>
       <p>この端末に保存された決定ログは削除されません（不要な場合は、ブラウザの設定からこのサイトのデータを削除してください）。</p>`,
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
    renderGoogleButton,
    client: () => client
  });
})();

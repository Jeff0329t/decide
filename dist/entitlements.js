// DECIDE. 無料枠とPRO判定
// 無料枠：ドロー累計10回・ログ保存10件（別カウンタ）。ドロー回数はログを消しても戻らない。
// 無料枠は端末内判定（回避可能なのは既知の制約として許容）。サーバーで守るのはPRO判定（profiles.plan_type）のみ。
(function(){
  const STORE_KEY = 'decide.tarot.entitlements.v1';
  const CHECKOUT_FLAG = 'decide.tarot.pendingCheckout';
  const FREE_DRAWS = 10;
  const FREE_SAVES = 10;

  const notify = message => { if(typeof toast === 'function') toast(message); };
  const auth = () => window.DECIDE_AUTH || null;
  const toCount = value => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? n : 0; };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      return { draws: toCount(raw.draws), plan: typeof raw.plan === 'string' ? raw.plan : 'free',
        proSince: raw.proSince || null, userId: raw.userId || null, checkedAt: raw.checkedAt || null };
    } catch(error) {
      return { draws: 0, plan: 'free', proSince: null, userId: null, checkedAt: null };
    }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(error) {}
  }

  // 純粋関数（テスト用にも公開）
  const isProPlan = plan => typeof plan === 'string' && plan !== '' && plan !== 'free';
  const mergeDraws = (local, server) => Math.max(toCount(local), toCount(server));

  function currentUser() {
    return auth()?.getUser?.() || null;
  }

  // PRO判定：ログイン中ユーザーのキャッシュ済み plan_type が 'free' 以外
  function hasProAccess(user = currentUser()) {
    if(!user?.id) return false;
    return state.userId === user.id && isProPlan(state.plan);
  }
  function canDraw() {
    return hasProAccess() || state.draws < FREE_DRAWS;
  }
  function canSaveLog(count) {
    return hasProAccess() || toCount(count) < FREE_SAVES;
  }
  function drawCount() {
    return state.draws;
  }
  function remaining(logCount = 0) {
    if(hasProAccess()) return { draws: Infinity, saves: Infinity, pro: true };
    return { draws: Math.max(0, FREE_DRAWS - state.draws), saves: Math.max(0, FREE_SAVES - toCount(logCount)), pro: false };
  }

  function rpcClient() {
    const a = auth();
    return a?.isEnabled?.() && a.getUser?.() ? a.client?.() : null;
  }

  function recordDraw() {
    state.draws += 1;
    save();
    const client = rpcClient();
    if(!client) return;
    Promise.resolve(client.rpc('record_draw')).then(({ data, error } = {}) => {
      if(error || data == null) return;
      const merged = mergeDraws(state.draws, data);
      if(merged !== state.draws) { state.draws = merged; save(); }
    }).catch(() => {});
  }

  // ログイン時：ドロー回数は max(端末, DB)（加算しない）。PRO判定はサーバーから取得してキャッシュ。
  async function syncWithServer(user) {
    const client = rpcClient();
    if(!client || !user?.id) return;
    try {
      const { data, error } = await client.rpc('merge_local_draws', { p_count: state.draws });
      if(!error && data != null) state.draws = mergeDraws(state.draws, data);
    } catch(error) {}
    try {
      const { data, error } = await client.from('profiles').select('plan_type, pro_since').eq('id', user.id).maybeSingle();
      if(!error && data) {
        state.plan = data.plan_type || 'free';
        state.proSince = data.pro_since || null;
        state.userId = user.id;
        state.checkedAt = new Date().toISOString();
      }
    } catch(error) {
      // オフライン等：直近のキャッシュ値を使う
    }
    save();
    resumeCheckout(user);
  }

  function handleUser(user) {
    if(!user) {
      // ログアウト：ドロー回数は端末に残し、PROキャッシュだけ消す
      state.plan = 'free'; state.proSince = null; state.userId = null; state.checkedAt = null;
      save();
      return;
    }
    syncWithServer(user);
  }

  // ペイウォール（PROプラン案内）
  function closeSheet(id) {
    if(typeof closeModal === 'function') closeModal(`#${id}`);
    else document.querySelector(`#${id}`)?.remove();
  }

  function openPaywall(reason) {
    const id = 'paywall-modal';
    if(document.querySelector(`#${id}`)) return;
    const user = currentUser();
    const lead = reason === 'save'
      ? `無料で保存できる決定ログは${FREE_SAVES}件までです。`
      : `無料で引けるのは累計${FREE_DRAWS}回までです。`;
    const next = user
      ? 'PRO（買い切り ¥980）で、ドローもログ保存も無制限になります。'
      : 'PRO（買い切り ¥980）で、ドローもログ保存も無制限になります。購入にはGoogleでのログインが必要です（ログイン後に購入へ進みます）。';
    const primary = user
      ? `<button class="button" type="button" data-ent-action="checkout">PROを購入（¥980）</button>`
      : `<button class="button" type="button" data-ent-action="login">Googleでログイン</button>`;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.id = id;
    wrap.innerHTML = `<button class="modal-shade" type="button" data-ent-action="close" aria-label="閉じる"></button>
      <section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="sheet-handle" aria-hidden="true"></div>
        <p class="eyebrow">DECIDE. PRO</p>
        <h2 id="${id}-title">無料枠を使い切りました</h2>
        <p>${lead}</p>
        <p>${next}</p>
        <div class="confirm-actions">${primary}
          <button class="button secondary" type="button" data-ent-action="close">閉じる</button></div>
      </section>`;
    if(typeof mountModal === 'function') mountModal(wrap, '.confirm-actions button');
    else document.body.appendChild(wrap);
  }

  function setPendingCheckout(on) {
    try { on ? sessionStorage.setItem(CHECKOUT_FLAG, '1') : sessionStorage.removeItem(CHECKOUT_FLAG); } catch(error) {}
  }
  function hasPendingCheckout() {
    try { return sessionStorage.getItem(CHECKOUT_FLAG) === '1'; } catch(error) { return false; }
  }

  // 未ログインで案内からログインした場合、戻ってきたら購入案内を再表示
  function resumeCheckout(user) {
    if(!user || !hasPendingCheckout()) return;
    setPendingCheckout(false);
    if(hasProAccess(user)) return;
    setTimeout(() => openPaywall('login'), 300);
  }

  // Stripe Checkout（買い切り）：Edge Function create-checkout でセッションを作り、決済ページへ遷移
  let checkoutBusy = false;
  function checkoutEndpoint() {
    const base = window.DECIDE_CONFIG?.SUPABASE_URL;
    return base ? `${base}/functions/v1/create-checkout` : null;
  }
  async function startCheckout() {
    if(!currentUser()) { openPaywall('login'); return; }
    if(hasProAccess()) { notify('すでにPROです'); return; }
    if(checkoutBusy) return;
    const endpoint = checkoutEndpoint();
    if(typeof fetch !== 'function' || !endpoint || !auth()?.isEnabled?.()) { notify('購入は準備中です'); return; }
    checkoutBusy = true;
    const buttons = document.querySelectorAll?.('[data-ent-action="checkout"]') || [];
    buttons.forEach(button => { button.disabled = true; });
    let leaving = false;
    try {
      const token = await auth().accessToken?.();
      if(!token) { notify('ログインし直してください'); return; }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: window.DECIDE_CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: '{}'
      });
      if(res.status === 409) {
        notify('すでにPROです');
        await syncWithServer(currentUser());
        return;
      }
      const data = await res.json().catch(() => ({}));
      if(!res.ok || typeof data.url !== 'string' || !/^https:\/\//.test(data.url)) {
        notify('購入ページを開けませんでした。時間をおいて試してください');
        return;
      }
      leaving = true;
      location.href = data.url;
    } catch(error) {
      notify('通信に失敗しました。オンラインで再度お試しください');
    } finally {
      if(!leaving) {
        checkoutBusy = false;
        buttons.forEach(button => { button.disabled = false; });
      }
    }
  }

  // 決済をキャンセルして戻ってきた場合（cancel_url = /?checkout=cancel）
  function handleCheckoutReturn() {
    if(typeof location === 'undefined' || typeof URLSearchParams !== 'function') return;
    try {
      const params = new URLSearchParams(location.search || '');
      if(params.get('checkout') !== 'cancel') return;
      params.delete('checkout');
      const query = params.toString();
      history.replaceState?.(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash || ''}`);
      setTimeout(() => notify('購入をキャンセルしました'), 400);
    } catch(error) {}
  }

  document.addEventListener('click', async event => {
    const target = event.target.closest?.('[data-ent-action]');
    if(!target) return;
    const action = target.dataset.entAction;
    const modal = target.closest('.modal-wrap');
    if(action === 'close') { if(modal) closeSheet(modal.id); return; }
    if(action === 'login') {
      if(!auth()?.isEnabled?.()) { notify('ログインは準備中です'); return; }
      setPendingCheckout(true);
      await auth().signInWithGoogle();
      return;
    }
    if(action === 'checkout') { await startCheckout(); }
  });

  handleCheckoutReturn();

  window.addEventListener?.('online', () => { const user = currentUser(); if(user) syncWithServer(user); });

  const a = auth();
  if(a?.onChange) {
    a.onChange(handleUser);
    Promise.resolve(a.ready?.()).then(user => { if(user) syncWithServer(user); }).catch(() => {});
  }

  window.DECIDE_ENTITLEMENTS = Object.freeze({
    FREE_DRAWS,
    FREE_SAVES,
    hasProAccess,
    canDraw,
    canSaveLog,
    recordDraw,
    drawCount,
    remaining,
    openPaywall,
    startCheckout,
    refresh: () => syncWithServer(currentUser()),
    _pure: Object.freeze({ isProPlan, mergeDraws })
  });
})();

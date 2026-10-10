// DECIDE. 無料枠とUNLIMITED EDITION判定
// 無料枠：ドロー累計10回・ログ保存10件（別カウンタ）。ドロー回数はログを消しても戻らない。
// 無料枠は端末内判定（回避可能なのは既知の制約として許容）。サーバーで守るのはPRO判定（profiles.plan_type）のみ。
(function(){
  const STORE_KEY = 'decide.tarot.entitlements.v1';
  const CHECKOUT_FLAG = 'decide.tarot.pendingCheckout';
  const FREE_DRAWS = 10;
  const FREE_SAVES = 10;
  // PROキャッシュの有効期限：返金・解約後に端末だけPROのまま残らないよう、期限切れなら無料扱い（再同期で復帰）
  const PRO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  // フォアグラウンド復帰時の再取得は最短この間隔で
  const RESYNC_MIN_INTERVAL_MS = 60 * 1000;

  const notify = message => { if(typeof toast === 'function') toast(message); };
  const auth = () => window.DECIDE_AUTH || null;
  const toCount = value => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? n : 0; };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      return { draws: toCount(raw.draws), plan: typeof raw.plan === 'string' ? raw.plan : 'free',
        proSince: raw.proSince || null, proUntil: raw.proUntil || null, userId: raw.userId || null, checkedAt: raw.checkedAt || null };
    } catch(error) {
      return { draws: 0, plan: 'free', proSince: null, proUntil: null, userId: null, checkedAt: null };
    }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(error) {}
  }

  // 純粋関数（テスト用にも公開）
  const isProPlan = plan => typeof plan === 'string' && plan !== '' && plan !== 'free';
  const mergeDraws = (local, server) => Math.max(toCount(local), toCount(server));
  const isCacheFresh = (checkedAt, now = Date.now()) => {
    const t = Date.parse(checkedAt);
    return Number.isFinite(t) && now - t < PRO_CACHE_TTL_MS;
  };
  // 購入済み、または招待特典（profiles.pro_until）が期限内
  const isProActive = (plan, proUntil, now = Date.now()) => {
    if(isProPlan(plan)) return true;
    const t = Date.parse(proUntil);
    return Number.isFinite(t) && t > now;
  };

  function currentUser() {
    return auth()?.getUser?.() || null;
  }

  // PRO判定：ログイン中ユーザーのキャッシュ済み plan_type が 'free' 以外（または招待特典が期限内）、かつキャッシュが期限内
  function isCachedFor(user) {
    return !!user?.id && state.userId === user.id && isCacheFresh(state.checkedAt);
  }
  function hasProAccess(user = currentUser()) {
    return isCachedFor(user) && isProActive(state.plan, state.proUntil);
  }
  // 買い切り購入済みか（招待特典だけの人は購入できるように区別する）
  function hasPurchased(user = currentUser()) {
    return isCachedFor(user) && isProPlan(state.plan);
  }
  // 招待特典の期限（購入済み・特典なし・期限切れなら null）
  function proUntil(user = currentUser()) {
    if(!isCachedFor(user) || isProPlan(state.plan)) return null;
    return isProActive(state.plan, state.proUntil) ? state.proUntil : null;
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
  let lastSyncAt = 0;
  async function syncWithServer(user) {
    const client = rpcClient();
    if(!client || !user?.id) return;
    lastSyncAt = Date.now();
    try {
      const { data, error } = await client.rpc('merge_local_draws', { p_count: state.draws });
      if(!error && data != null) state.draws = mergeDraws(state.draws, data);
    } catch(error) {}
    try {
      const { data, error } = await client.from('profiles').select('plan_type, pro_since, pro_until').eq('id', user.id).maybeSingle();
      if(!error && data) {
        state.plan = data.plan_type || 'free';
        state.proSince = data.pro_since || null;
        state.proUntil = data.pro_until || null;
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
      state.plan = 'free'; state.proSince = null; state.proUntil = null; state.userId = null; state.checkedAt = null;
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
    const title = reason === 'save' ? '保存できる上限に達しました'
      : reason === 'draw' ? '無料で引ける回数を使い切りました'
      : '本1冊分で、迷いに強くなる';
    const lead = reason === 'save'
      ? `無料で保存できる決定ログは${FREE_SAVES}件までです。`
      : reason === 'draw'
        ? `無料で引けるのは累計${FREE_DRAWS}回までです。`
        : `無料プランはドロー${FREE_DRAWS}回・ログ保存${FREE_SAVES}件までです。`;
    const pitch = '本1冊分の¥980で、この先ずっと引き放題・残し放題。月額ではないので、迷う夜が何度来ても追加料金はかかりません。読み終わる本とちがって、あなたの答えは何度でも引き出せます。';
    const next = user
      ? pitch
      : `${pitch}<br><small>購入にはGoogleでのログインが必要です（ログイン後に購入へ進みます）。</small>`;
    const primary = user
      ? `<button class="button" type="button" data-ent-action="checkout">¥980で手に入れる</button>`
      : `<div class="google-signin" data-google-button hidden></div>
         <button class="button" type="button" data-ent-action="login">Googleでログイン</button>`;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.id = id;
    wrap.innerHTML = `<button class="modal-shade" type="button" data-ent-action="close" aria-label="閉じる"></button>
      <section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="sheet-handle" aria-hidden="true"></div>
        <p class="eyebrow">UNLIMITED EDITION</p>
        <h2 id="${id}-title">${title}</h2>
        <p>${lead}</p>
        <p>${next}</p>
        <div class="confirm-actions">${primary}
          <button class="button secondary" type="button" data-ent-action="close">閉じる</button></div>
        <p class="paywall-legal"><a href="./tokushoho.html" target="_blank" rel="noopener">特定商取引法に基づく表記</a> · <a href="./terms.html" target="_blank" rel="noopener">利用規約</a></p>
      </section>`;
    if(typeof mountModal === 'function') mountModal(wrap, '.confirm-actions button');
    else document.body.appendChild(wrap);
    // 未ログイン：Googleボタンをこの画面に直接出す（出せなければ従来ボタンでリダイレクト）
    if(!user && auth()?.renderGoogleButton) {
      setPendingCheckout(true);
      Promise.resolve(auth().renderGoogleButton(wrap.querySelector('[data-google-button]'))).then(ok => {
        const fallback = wrap.querySelector('[data-ent-action="login"]');
        if(ok && fallback) fallback.hidden = true;
      }).catch(() => {});
    }
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
    if(hasPurchased(user)) return;
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
    if(hasPurchased()) { notify('すでに購入済みです'); return; }
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
        notify('すでに購入済みです');
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
  // フォアグラウンド復帰時に plan_type を取り直す（返金で free に戻った場合を反映）
  document.addEventListener?.('visibilitychange', () => {
    if(document.visibilityState !== 'visible' || Date.now() - lastSyncAt < RESYNC_MIN_INTERVAL_MS) return;
    const user = currentUser();
    if(user) syncWithServer(user);
  });

  const a = auth();
  if(a?.onChange) {
    a.onChange(handleUser);
    Promise.resolve(a.ready?.()).then(user => { if(user) syncWithServer(user); }).catch(() => {});
  }

  window.DECIDE_ENTITLEMENTS = Object.freeze({
    FREE_DRAWS,
    FREE_SAVES,
    hasProAccess,
    hasPurchased,
    proUntil,
    canDraw,
    canSaveLog,
    recordDraw,
    drawCount,
    remaining,
    openPaywall,
    startCheckout,
    refresh: () => syncWithServer(currentUser()),
    _pure: Object.freeze({ isProPlan, isProActive, mergeDraws, isCacheFresh })
  });
})();

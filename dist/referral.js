// DECIDE. 友だち招待（ログインした人だけ）
// 招待リンク（?ref=コード）で開いた人がログインすると、サーバーに「だれの招待か」だけを記録する。
// 送るのは招待コードだけで、決定ログの中身は送らない。
// 特典：招待した人・された人の両方に UNLIMITED を3日間（claim_referral（SQL）側で profiles.pro_until を延ばす）。
(function(){
  const STORE_KEY = 'decide.tarot.referral.v1';
  const CODE_RE = /^[A-Z0-9]{4,16}$/;
  const REWARD_CAP = 5; // 招待した側に特典がつく人数（claim_referral（SQL）の referrer_cap と同じ）

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const notify = message => { if(typeof toast === 'function') toast(message); };
  const auth = () => window.DECIDE_AUTH || null;
  const hasLocation = () => typeof location !== 'undefined' && !!location;

  // 純粋関数（テスト用にも公開）
  function normalizeCode(value) {
    const code = String(value ?? '').trim().toUpperCase();
    return CODE_RE.test(code) ? code : '';
  }
  function inviteUrl(origin, pathname, code) {
    const c = normalizeCode(code);
    return c ? `${origin}${pathname}?ref=${c}` : '';
  }
  // 招待した人数の表示（count が数値でなければ出さない）
  function countHtml(count) {
    if(!Number.isInteger(count) || count < 0) return '';
    const left = Math.max(0, REWARD_CAP - count);
    const note = left > 0
      ? `特典はあと <b>${left}人</b> までもらえます`
      : `特典の上限（${REWARD_CAP}人）に達しました。招待はこれからもできます`;
    return `<p class="referral-count">招待した人 <b>${count}人</b> ／ ${note}</p>`;
  }
  function sectionHtml(code, url, count) {
    const c = normalizeCode(code);
    const body = c
      ? `<p>このリンクから始めた人がログインすると、招待した人・された人どちらにもUNLIMITEDを3日間プレゼントします（招待した人への特典は${REWARD_CAP}人まで）。</p>
        <p class="referral-code">招待コード <b>${escapeHtml(c)}</b></p>
        ${countHtml(count)}
        <div class="data-actions">
          <button class="button" type="button" data-referral-action="share" data-referral-url="${escapeHtml(url)}">招待リンクを送る</button>
          <button class="button secondary" type="button" data-referral-action="copy" data-referral-url="${escapeHtml(url)}">リンクをコピー</button>
        </div>`
      : `<p>招待リンクを準備しています…</p>`;
    return `<div class="referral-setting" data-referral-section><div><b>友だちを招待</b>${body}</div></div>`;
  }
  // URL から ?ref= を取り出し、残りのURLを返す
  function takeRefFromUrl(href) {
    try {
      const url = new URL(href);
      if(!url.searchParams.has('ref')) return { code: '', cleaned: '' };
      const code = normalizeCode(url.searchParams.get('ref'));
      url.searchParams.delete('ref');
      return { code, cleaned: url.pathname + url.search + url.hash };
    } catch(error) {
      return { code: '', cleaned: '' };
    }
  }

  function pendingCode() {
    try { return normalizeCode(localStorage.getItem(STORE_KEY)); } catch(error) { return ''; }
  }
  function savePending(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch(error) {}
  }
  function clearPending() {
    try { localStorage.removeItem(STORE_KEY); } catch(error) {}
  }

  // 開いたURLに ?ref= があれば保存して、アドレスバーから消す
  function captureFromUrl() {
    if(!hasLocation() || typeof location.href !== 'string') return;
    const { code, cleaned } = takeRefFromUrl(location.href);
    if(!cleaned) return;
    if(code) savePending(code);
    try { if(typeof history !== 'undefined') history.replaceState(history.state, '', cleaned); } catch(error) {}
  }

  let myCode = '';
  let loading = null;
  let failedAt = 0; // 取得に失敗した時刻（すぐに再試行して通信がくり返されないように）
  let claiming = false;
  let invitedCount = null; // 招待した人数（未取得なら null）
  let countAt = 0;         // 人数を取りにいった時刻（設定を開くたびに通信しすぎないように）
  let countLoading = false;

  async function claimIfNeeded(user) {
    const code = pendingCode();
    const client = auth()?.client?.();
    if(!code || !user || !client || claiming) return;
    claiming = true;
    try {
      const { data, error } = await client.rpc('claim_referral', { code });
      if(error) return; // 通信エラーなどは次回もう一度
      clearPending();
      if(data === 'ok') {
        notify('UNLIMITEDを3日間プレゼントしました');
        window.DECIDE_ENTITLEMENTS?.refresh?.();
      }
    } catch(error) {
      // 次回もう一度
    } finally {
      claiming = false;
    }
  }

  function fetchMyCode() {
    if(myCode) return Promise.resolve(myCode);
    if(loading) return loading;
    if(failedAt && Date.now() - failedAt < 60000) return Promise.resolve('');
    const client = auth()?.client?.();
    if(!client || !auth()?.getUser?.()) return Promise.resolve('');
    loading = client.rpc('get_or_create_referral_code')
      .then(({ data, error }) => {
        if(!error) myCode = normalizeCode(data);
        failedAt = myCode ? 0 : Date.now();
        return myCode;
      })
      .catch(() => { failedAt = Date.now(); return ''; })
      .finally(() => { loading = null; refreshSection(); });
    return loading;
  }

  // 招待した人数（referrals は RLS で自分が招待した行だけ見える）
  function fetchInvitedCount() {
    const client = auth()?.client?.();
    const uid = auth()?.getUser?.()?.id;
    if(!client?.from || !uid || countLoading) return;
    if(countAt && Date.now() - countAt < 30000) return;
    countLoading = true;
    countAt = Date.now();
    Promise.resolve()
      .then(() => client.from('referrals').select('referred_id', { count: 'exact', head: true }).eq('referrer_id', uid))
      .then(({ count, error }) => { if(!error && Number.isInteger(count)) invitedCount = count; })
      .catch(() => {})
      .finally(() => { countLoading = false; refreshSection(); });
  }

  function currentUrl() {
    if(!hasLocation() || !myCode) return '';
    return inviteUrl(location.origin, location.pathname, myCode);
  }

  // 設定画面のアカウント欄（ログイン中）に入れるHTML
  function renderSettings() {
    if(!auth()?.getUser?.() || !auth()?.client?.()) return '';
    if(!myCode) fetchMyCode();
    else fetchInvitedCount();
    return sectionHtml(myCode, currentUrl(), invitedCount);
  }

  function refreshSection() {
    if(typeof document === 'undefined') return;
    const el = document.querySelector('[data-referral-section]');
    if(!el) return;
    const html = renderSettings();
    if(html) el.outerHTML = html; else el.remove();
  }

  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      notify('招待リンクをコピーしました');
    } catch(error) {
      notify('コピーできませんでした');
    }
  }

  async function shareLink(url) {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if(nav?.share) {
      try {
        await nav.share({ title: 'DECIDE.', text: '迷ったときに、タロットで決断を整理するアプリ。', url });
        return;
      } catch(error) {
        if(error?.name === 'AbortError') return;
      }
    }
    await copyLink(url);
  }

  if(typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      const el = event.target.closest?.('[data-referral-action]');
      if(!el) return;
      event.preventDefault();
      const url = el.dataset.referralUrl || currentUrl();
      if(!url) return;
      if(el.dataset.referralAction === 'copy') copyLink(url);
      if(el.dataset.referralAction === 'share') shareLink(url);
    });
  }

  captureFromUrl();
  auth()?.onChange?.(user => {
    if(!user) { myCode = ''; failedAt = 0; invitedCount = null; countAt = 0; return; }
    claimIfNeeded(user);
  });
  auth()?.ready?.()?.then?.(user => { if(user) claimIfNeeded(user); });

  window.DECIDE_REFERRAL = Object.freeze({
    renderSettings,
    pendingCode,
    _pure: { normalizeCode, inviteUrl, sectionHtml, countHtml, takeRefFromUrl }
  });
})();

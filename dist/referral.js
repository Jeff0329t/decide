// DECIDE. 友だち招待（ログインした人だけ）
// 招待リンク（?ref=コード）で開いた人がログインすると、サーバーに「だれの招待か」だけを記録する。
// 送るのは招待コードだけで、決定ログの中身は送らない。
// TODO: 招待の特典（何を・いつ付けるか）は未定。決まったら claim_referral（SQL）側で付ける。
(function(){
  const STORE_KEY = 'decide.tarot.referral.v1';
  const CODE_RE = /^[A-Z0-9]{4,16}$/;

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
  function sectionHtml(code, url) {
    const c = normalizeCode(code);
    const body = c
      ? `<p>このリンクから始めた人がログインすると、あなたの招待として記録されます。</p>
        <p class="referral-code">招待コード <b>${escapeHtml(c)}</b></p>
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

  async function claimIfNeeded(user) {
    const code = pendingCode();
    const client = auth()?.client?.();
    if(!code || !user || !client || claiming) return;
    claiming = true;
    try {
      const { data, error } = await client.rpc('claim_referral', { code });
      if(error) return; // 通信エラーなどは次回もう一度
      clearPending();
      if(data === 'ok') notify('招待リンクから始めました');
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

  function currentUrl() {
    if(!hasLocation() || !myCode) return '';
    return inviteUrl(location.origin, location.pathname, myCode);
  }

  // 設定画面のアカウント欄（ログイン中）に入れるHTML
  function renderSettings() {
    if(!auth()?.getUser?.() || !auth()?.client?.()) return '';
    if(!myCode) fetchMyCode();
    return sectionHtml(myCode, currentUrl());
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
    if(!user) { myCode = ''; failedAt = 0; return; }
    claimIfNeeded(user);
  });
  auth()?.ready?.()?.then?.(user => { if(user) claimIfNeeded(user); });

  window.DECIDE_REFERRAL = Object.freeze({
    renderSettings,
    pendingCode,
    _pure: { normalizeCode, inviteUrl, sectionHtml, takeRefFromUrl }
  });
})();

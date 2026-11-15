// DECIDE. 店舗紹介（QR・店舗別URL）
// 店舗のQR（?via=コード）で開いた人がログインすると、サーバーに「どの店舗から来たか」だけを記録する。
// 送るのは店舗コードだけで、決定ログの中身は送らない。
// 購入が成立したときだけ店舗に紹介報酬がつく（確定は stripe-webhook 側）。ここでは画面に何も出さない。
// 友だち招待（?ref=）とはパラメータも保存キーも別で、互いに干渉しない。
(function(){
  const STORE_KEY = 'decide.partner.v1';
  const CODE_RE = /^[a-z0-9-]{3,32}$/;
  const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 紹介の有効期限は取得から30日（bind_partner_attribution（SQL）側と同じ）

  const auth = () => window.DECIDE_AUTH || null;
  const hasLocation = () => typeof location !== 'undefined' && !!location;

  // 純粋関数（テスト用にも公開）
  function normalizeCode(value) {
    const code = String(value ?? '').trim().toLowerCase();
    return CODE_RE.test(code) ? code : '';
  }
  function isExpired(capturedAt, now) {
    const t = Date.parse(capturedAt);
    if(!Number.isFinite(t)) return true;
    return now - t > TTL_MS;
  }
  // URL から ?via= を取り出し、残りのURLを返す（?ref= など他のパラメータには触れない）
  function takeViaFromUrl(href) {
    try {
      const url = new URL(href);
      if(!url.searchParams.has('via')) return { code: '', cleaned: '' };
      const code = normalizeCode(url.searchParams.get('via'));
      url.searchParams.delete('via');
      return { code, cleaned: url.pathname + url.search + url.hash };
    } catch(error) {
      return { code: '', cleaned: '' };
    }
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      const code = normalizeCode(parsed?.code);
      if(!code || typeof parsed?.captured_at !== 'string') return null;
      return { code, captured_at: parsed.captured_at };
    } catch(error) { return null; }
  }
  function writeStore(entry) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(entry)); } catch(error) {}
  }
  function clearStore() {
    try { localStorage.removeItem(STORE_KEY); } catch(error) {}
  }
  // 保存済みの紹介を返す。期限切れは消して、無いものとして返す
  function pendingCapture(now = Date.now()) {
    const entry = readStore();
    if(!entry) return null;
    if(isExpired(entry.captured_at, now)) { clearStore(); return null; }
    return entry;
  }

  // 開いたURLに ?via= があれば保存して、アドレスバーから消す
  // まだ有効な紹介が保存済みのときは上書きしない（ファーストタッチ優先。サーバー側の記録も先着）
  function captureFromUrl() {
    if(!hasLocation() || typeof location.href !== 'string') return;
    const { code, cleaned } = takeViaFromUrl(location.href);
    if(!cleaned) return;
    if(code && !pendingCapture()) {
      writeStore({ code, captured_at: new Date().toISOString() });
    }
    try { if(typeof history !== 'undefined') history.replaceState(history.state, '', cleaned); } catch(error) {}
  }

  let binding = false;
  async function bindIfNeeded(user) {
    const entry = pendingCapture();
    const client = auth()?.client?.();
    if(!entry || !user || !client || binding) return;
    binding = true;
    try {
      const { error } = await client.rpc('bind_partner_attribution', { p_code: entry.code, p_captured_at: entry.captured_at });
      if(error) return; // 通信エラーなどは次回もう一度
      // 'ok'（記録した）・'already'（別の店舗が先）・'expired'・'invalid' はどれも確定なので消す
      clearStore();
    } catch(error) {
      // 次回もう一度
    } finally {
      binding = false;
    }
  }

  captureFromUrl();
  auth()?.onChange?.(user => { if(user) bindIfNeeded(user); });
  auth()?.ready?.()?.then?.(user => { if(user) bindIfNeeded(user); });

  window.DECIDE_PARTNER = Object.freeze({
    pendingCapture,
    _pure: { normalizeCode, takeViaFromUrl, isExpired }
  });
})();

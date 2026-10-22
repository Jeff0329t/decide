// DECIDE. リマインドメールの停止ページ（メール内のリンク /unsubscribe?t=トークン から開く）
// 開いただけでは止めない（メールのリンクを先読みするセキュリティ機能で勝手に止まらないように）。ボタンを押したときだけ送る。
// トークンはアドレスバーから消してメモリにだけ持つ。ログインは不要。
(function(){
  const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function show(state) {
    if(typeof document === 'undefined') return;
    document.querySelectorAll?.('[data-state]').forEach(el => { el.hidden = el.dataset.state !== state; });
  }

  function takeToken(href) {
    try {
      const token = new URL(href).searchParams.get('t') || '';
      return TOKEN_RE.test(token) ? token.toLowerCase() : '';
    } catch(error) {
      return '';
    }
  }

  // 戻り値：'done' | 'invalid' | 'error'
  async function unsubscribe(token, { config = window.DECIDE_CONFIG || {}, fetchImpl = fetch } = {}) {
    if(!TOKEN_RE.test(token || '')) return 'invalid';
    if(!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return 'error';
    try {
      const res = await fetchImpl(`${config.SUPABASE_URL}/rest/v1/rpc/email_unsubscribe`, {
        method: 'POST',
        headers: { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if(!res.ok) return 'error';
      return (await res.json()) === true ? 'done' : 'invalid';
    } catch(error) {
      return 'error';
    }
  }

  window.DECIDE_UNSUBSCRIBE = Object.freeze({ unsubscribe, takeToken });
  if(typeof document === 'undefined' || !document.querySelector?.('[data-state="ready"]')) return;

  const token = takeToken(location.href);
  try { history.replaceState(null, '', location.pathname); } catch(error) {}
  if(!token) { show('invalid'); return; }
  let running = false;
  document.addEventListener('click', async event => {
    if(!event.target.closest?.('[data-action="unsubscribe"]') || running) return;
    running = true;
    show('busy');
    show(await unsubscribe(token));
    running = false;
  });
})();

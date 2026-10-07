// DECIDE. 購入完了ページ：Webhookで profiles.plan_type が更新されるのを待って表示する
// plan_type はサーバー（stripe-webhook）だけが書き込む。ここでは読むだけ。
(function(){
  const STORE_KEY = 'decide.tarot.entitlements.v1';
  const POLL_INTERVAL = 2000;
  const POLL_TIMEOUT = 30000;
  const isProPlan = plan => typeof plan === 'string' && plan !== '' && plan !== 'free';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function show(state) {
    if(typeof document === 'undefined') return;
    document.querySelectorAll?.('[data-state]').forEach(el => { el.hidden = el.dataset.state !== state; });
  }

  // アプリ側のPROキャッシュを更新（次回起動時にすぐPRO表示になるように）
  function cachePro(userId, plan, proSince) {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...raw, plan, proSince: proSince || null, userId,
        checkedAt: new Date().toISOString() }));
    } catch(error) {}
  }

  async function fetchPlan(client, userId) {
    try {
      const { data, error } = await client.from('profiles').select('plan_type, pro_since').eq('id', userId).maybeSingle();
      return error || !data ? null : data;
    } catch(error) {
      return null;
    }
  }

  // 戻り値：'done' | 'timeout' | 'login' | 'unavailable'
  async function waitForPro({ timeout = POLL_TIMEOUT, interval = POLL_INTERVAL, now = () => Date.now() } = {}) {
    const auth = window.DECIDE_AUTH;
    const client = auth?.client?.();
    if(!client || !auth.isEnabled?.()) return 'unavailable';
    const user = await auth.ready();
    if(!user?.id) return 'login';
    const start = now();
    for(;;) {
      const data = await fetchPlan(client, user.id);
      if(data && isProPlan(data.plan_type)) {
        cachePro(user.id, data.plan_type, data.pro_since);
        return 'done';
      }
      if(now() - start + interval > timeout) return 'timeout';
      await wait(interval);
    }
  }

  async function run() {
    show('pending');
    const result = await waitForPro();
    show(result);
  }

  window.DECIDE_SUCCESS = Object.freeze({ waitForPro, POLL_INTERVAL, POLL_TIMEOUT });
  if(typeof document !== 'undefined' && document.querySelector?.('[data-state="pending"]')) run();
})();

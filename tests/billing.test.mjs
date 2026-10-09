import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const STORE_KEY = 'decide.tarot.entitlements.v1';
const ENDPOINT = 'https://example.supabase.co/functions/v1/create-checkout';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    dump: () => Object.fromEntries(data)
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// entitlements.js を決済まわりの依存（fetch / location / history / DOM）付きで読み込む
function loadEntitlements({ user = null, enabled = true, token = 'user-token', fetchImpl, search = '', config, stored } = {}) {
  const toasts = [];
  const appended = [];
  const fetchCalls = [];
  const replaced = [];
  const timers = [];
  const buttons = [{ disabled: false }, { disabled: false }];
  const location = { search, pathname: '/', hash: '', href: 'https://decisionprocess.net/' };
  const sandbox = {
    window: {
      DECIDE_AUTH: {
        isEnabled: () => enabled,
        getUser: () => user,
        client: () => null,
        accessToken: async () => token
      },
      DECIDE_CONFIG: config === undefined ? { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-key' } : config,
      addEventListener() {}
    },
    fetch: fetchImpl ? async (url, init) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); } : undefined,
    location,
    history: { state: null, replaceState: (state, title, url) => replaced.push(url) },
    URLSearchParams,
    document: {
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => buttons,
      createElement: () => ({}),
      body: { appendChild: el => appended.push(el) }
    },
    toast: message => toasts.push(message),
    localStorage: memoryStorage(stored ? { [STORE_KEY]: JSON.stringify(stored) } : {}),
    sessionStorage: memoryStorage(),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    console,
    Promise
  };
  if(!fetchImpl) delete sandbox.fetch;
  vm.runInNewContext(read('entitlements.js'), sandbox);
  return { ent: sandbox.window.DECIDE_ENTITLEMENTS, toasts, appended, fetchCalls, replaced, timers, buttons, location };
}

const jsonResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const USER = { id: 'user-1', email: 'a@example.com' };

test('未ログインで購入するとログイン案内のペイウォールを出し、決済APIは呼ばない', async () => {
  const env = loadEntitlements({ fetchImpl: () => jsonResponse(200, { url: 'https://checkout.stripe.com/x' }) });
  await env.ent.startCheckout();
  assert.equal(env.fetchCalls.length, 0);
  assert.equal(env.appended.length, 1);
  assert.equal(env.appended[0].id, 'paywall-modal');
  assert.match(env.appended[0].innerHTML, /data-ent-action="login"/);
  assert.match(env.appended[0].innerHTML, /Googleでログイン/);
});

test('ログイン中のペイウォールには購入ボタンが出る', () => {
  const env = loadEntitlements({ user: USER });
  env.ent.openPaywall('draw');
  assert.match(env.appended[0].innerHTML, /data-ent-action="checkout"/);
  assert.match(env.appended[0].innerHTML, /¥980/);
});

test('設定が無い・認証が無効なら「準備中」を表示する', async () => {
  const noEndpoint = loadEntitlements({ user: USER, config: {}, fetchImpl: () => jsonResponse(200, {}) });
  await noEndpoint.ent.startCheckout();
  assert.deepEqual(noEndpoint.toasts, ['購入は準備中です']);
  assert.equal(noEndpoint.fetchCalls.length, 0);

  const disabled = loadEntitlements({ user: USER, enabled: false, fetchImpl: () => jsonResponse(200, {}) });
  await disabled.ent.startCheckout();
  assert.deepEqual(disabled.toasts, ['購入は準備中です']);

  const noFetch = loadEntitlements({ user: USER });
  await noFetch.ent.startCheckout();
  assert.deepEqual(noFetch.toasts, ['購入は準備中です']);
});

test('成功時はユーザーのトークンと anon キーで create-checkout を呼び、Stripe の URL へ遷移する', async () => {
  const env = loadEntitlements({ user: USER, fetchImpl: () => jsonResponse(200, { url: 'https://checkout.stripe.com/c/pay/cs_test_1' }) });
  await env.ent.startCheckout();
  assert.equal(env.fetchCalls.length, 1);
  const { url, init } = env.fetchCalls[0];
  assert.equal(url, ENDPOINT);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer user-token');
  assert.equal(init.headers.apikey, 'anon-key');
  assert.equal(env.location.href, 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.deepEqual(env.toasts, []);
  // 遷移中はボタンを押せないままにする
  assert.ok(env.buttons.every(button => button.disabled));
});

test('すでにPRO（キャッシュ）なら決済APIを呼ばない', async () => {
  const env = loadEntitlements({
    user: USER,
    stored: { draws: 0, plan: 'lifetime', proSince: null, userId: USER.id, checkedAt: new Date().toISOString() },
    fetchImpl: () => jsonResponse(200, { url: 'https://checkout.stripe.com/x' })
  });
  await env.ent.startCheckout();
  assert.equal(env.fetchCalls.length, 0);
  assert.deepEqual(env.toasts, ['すでにPROです']);
});

test('サーバーが 409 を返したら「すでにPROです」と表示し遷移しない', async () => {
  const env = loadEntitlements({ user: USER, fetchImpl: () => jsonResponse(409, { error: 'already_pro' }) });
  await env.ent.startCheckout();
  assert.deepEqual(env.toasts, ['すでにPROです']);
  assert.equal(env.location.href, 'https://decisionprocess.net/');
  assert.ok(env.buttons.every(button => !button.disabled));
});

test('https 以外の URL やエラー応答では遷移しない', async () => {
  for(const response of [
    jsonResponse(200, { url: 'javascript:alert(1)' }),
    jsonResponse(200, { url: 'http://checkout.stripe.com/x' }),
    jsonResponse(500, { url: 'https://checkout.stripe.com/x' }),
    jsonResponse(200, {})
  ]) {
    const env = loadEntitlements({ user: USER, fetchImpl: () => response });
    await env.ent.startCheckout();
    assert.deepEqual(env.toasts, ['購入ページを開けませんでした。時間をおいて試してください']);
    assert.equal(env.location.href, 'https://decisionprocess.net/');
  }
});

test('トークンが取れなければ再ログインを促す', async () => {
  const env = loadEntitlements({ user: USER, token: null, fetchImpl: () => jsonResponse(200, {}) });
  await env.ent.startCheckout();
  assert.deepEqual(env.toasts, ['ログインし直してください']);
  assert.equal(env.fetchCalls.length, 0);
});

test('通信エラー時はメッセージを出し、ボタンを再び押せるようにする', async () => {
  const env = loadEntitlements({ user: USER, fetchImpl: () => { throw new TypeError('offline'); } });
  await env.ent.startCheckout();
  assert.deepEqual(env.toasts, ['通信に失敗しました。オンラインで再度お試しください']);
  assert.ok(env.buttons.every(button => !button.disabled));
});

test('連打しても決済APIは1回しか呼ばない', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const env = loadEntitlements({ user: USER, fetchImpl: async () => { await gate; return jsonResponse(200, { url: 'https://checkout.stripe.com/x' }); } });
  const first = env.ent.startCheckout();
  await flush();
  const second = env.ent.startCheckout();
  await flush();
  release();
  await Promise.all([first, second]);
  assert.equal(env.fetchCalls.length, 1);
});

test('キャンセルで戻ったら ?checkout=cancel を消してトーストを出す', () => {
  const env = loadEntitlements({ search: '?checkout=cancel' });
  assert.deepEqual(env.replaced, ['/']);
  const timer = env.timers.find(t => t.ms === 400);
  assert.ok(timer);
  timer.fn();
  assert.deepEqual(env.toasts, ['購入をキャンセルしました']);

  const keep = loadEntitlements({ search: '?checkout=cancel&q=1' });
  assert.deepEqual(keep.replaced, ['/?q=1']);

  const normal = loadEntitlements({ search: '?q=1' });
  assert.deepEqual(normal.replaced, []);
});

// success.js：Webhook 反映待ち
function loadSuccess({ client, enabled = true, user = USER, plans = [] } = {}) {
  let calls = 0;
  const queries = [];
  const mockClient = client === undefined ? {
    from: table => ({
      select: cols => ({
        eq: (col, value) => ({
          maybeSingle: async () => {
            queries.push({ table, cols, col, value });
            const plan = plans[Math.min(calls++, plans.length - 1)];
            return { data: plan === undefined ? null : { plan_type: plan, pro_since: '2026-10-06T00:00:00Z' }, error: null };
          }
        })
      })
    })
  } : client;
  const localStorage = memoryStorage();
  const sandbox = {
    window: { DECIDE_AUTH: { client: () => mockClient, isEnabled: () => enabled, ready: async () => user } },
    localStorage,
    setTimeout: fn => { fn(); return 0; },
    console,
    Promise
  };
  vm.runInNewContext(read('success.js'), sandbox);
  return { success: sandbox.window.DECIDE_SUCCESS, localStorage, queries, calls: () => calls };
}

test('success.js：plan_type が PRO になったら done を返し、キャッシュを更新する', async () => {
  const env = loadSuccess({ plans: ['free', 'free', 'lifetime'] });
  const result = await env.success.waitForPro({ timeout: 100, interval: 1, now: () => 0 });
  assert.equal(result, 'done');
  assert.equal(env.calls(), 3);
  assert.deepEqual({ ...env.queries[0] }, { table: 'profiles', cols: 'plan_type, pro_since', col: 'id', value: USER.id });
  const cached = JSON.parse(env.localStorage.getItem(STORE_KEY));
  assert.equal(cached.plan, 'lifetime');
  assert.equal(cached.userId, USER.id);
  assert.equal(cached.proSince, '2026-10-06T00:00:00Z');
});

test('success.js：時間内に反映されなければ timeout', async () => {
  let t = 0;
  const env = loadSuccess({ plans: ['free'] });
  const result = await env.success.waitForPro({ timeout: 10, interval: 1, now: () => t++ });
  assert.equal(result, 'timeout');
  assert.equal(env.localStorage.getItem(STORE_KEY), null);
});

test('success.js：未ログインは login、Supabase 未設定は unavailable', async () => {
  assert.equal(await loadSuccess({ user: null }).success.waitForPro({ interval: 1 }), 'login');
  assert.equal(await loadSuccess({ client: null }).success.waitForPro({ interval: 1 }), 'unavailable');
  assert.equal(await loadSuccess({ enabled: false }).success.waitForPro({ interval: 1 }), 'unavailable');
});

test('法務ページがあり、購入完了ページとプライバシーポリシーからリンクされている', () => {
  for(const page of ['tokushoho.html', 'terms.html', 'success.html']) {
    assert.ok(fs.existsSync(new URL(`../dist/${page}`, import.meta.url)), `${page} がありません`);
  }
  for(const page of ['privacy.html', 'success.html']) {
    const html = read(page);
    assert.match(html, /href="\.\/tokushoho\.html"/, `${page} → tokushoho`);
    assert.match(html, /href="\.\/terms\.html"/, `${page} → terms`);
  }
  assert.match(read('tokushoho.html'), /980/);
  assert.match(read('success.html'), /success\.js/);
});

// フロントに秘密情報を置かない（service_role / Stripe secret / Webhook secret）
function distTextFiles(dir = new URL('../dist/', import.meta.url)) {
  const files = [];
  for(const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if(entry.isDirectory()) files.push(...distTextFiles(url));
    else if(/\.(js|mjs|html|json|css|webmanifest|txt|map)$/.test(entry.name)) files.push(url);
  }
  return files;
}

test('dist/ に Stripe の秘密鍵・Webhook secret・service_role キーが含まれていない', () => {
  const files = distTextFiles();
  assert.ok(files.length > 0);
  for(const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const name = file.pathname.split('/dist/')[1];
    assert.doesNotMatch(text, /sk_(live|test)_[A-Za-z0-9]{10,}/, `${name}: Stripe secret key`);
    assert.doesNotMatch(text, /rk_(live|test)_[A-Za-z0-9]{10,}/, `${name}: Stripe restricted key`);
    assert.doesNotMatch(text, /whsec_[A-Za-z0-9]{10,}/, `${name}: Webhook secret`);
    for(const jwt of text.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) || []) {
      let payload = {};
      try { payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); } catch(error) {}
      assert.notEqual(payload.role, 'service_role', `${name}: service_role キー`);
    }
  }
});

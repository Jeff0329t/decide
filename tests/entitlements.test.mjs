import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const STORE_KEY = 'decide.tarot.entitlements.v1';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); },
    dump: () => Object.fromEntries(data)
  };
}

// entitlements.js を最小限のブラウザ環境で読み込む
function load({ stored, user = null, client = null } = {}) {
  const localStorage = memoryStorage(stored ? { [STORE_KEY]: JSON.stringify(stored) } : {});
  const auth = user === undefined ? undefined : {
    isEnabled: () => true,
    getUser: () => user,
    ready: () => Promise.resolve(null),
    onChange: () => {},
    client: () => client
  };
  const window = { DECIDE_AUTH: auth, addEventListener() {} };
  const listeners = {};
  const document = {
    visibilityState: 'visible',
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    querySelector: () => null
  };
  const sandbox = {
    window,
    localStorage,
    sessionStorage: memoryStorage(),
    document,
    setTimeout,
    console
  };
  vm.runInNewContext(read('entitlements.js'), sandbox);
  const fire = type => (listeners[type] || []).forEach(fn => fn());
  return { ent: window.DECIDE_ENTITLEMENTS, localStorage, document, fire };
}

const USER = { id: 'user-1', email: 'a@example.com' };
const FRESH = () => new Date().toISOString();
const DAY = 24 * 60 * 60 * 1000;

// profiles.plan_type を返す最小限の Supabase クライアント
function fakeClient(plan) {
  const calls = { profiles: 0 };
  return {
    calls,
    rpc: async () => ({ data: null, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
      calls.profiles += 1;
      return { data: { plan_type: plan.value, pro_since: null }, error: null };
    } }) }) })
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('無料枠は ドロー10回・ログ10件', () => {
  const { ent } = load();
  assert.equal(ent.FREE_DRAWS, 10);
  assert.equal(ent.FREE_SAVES, 10);
});

test('canDraw: 10回目までは可、11回目はブロック', () => {
  const { ent, localStorage } = load({ stored: { draws: 9 } });
  assert.equal(ent.canDraw(), true);
  ent.recordDraw();
  assert.equal(ent.drawCount(), 10);
  assert.equal(ent.canDraw(), false);
  assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).draws, 10);
});

test('canDraw: 保存済みのドロー回数を引き継ぐ（ログ削除で戻らない）', () => {
  assert.equal(load({ stored: { draws: 10 } }).ent.canDraw(), false);
  assert.equal(load({ stored: { draws: 0 } }).ent.canDraw(), true);
  assert.equal(load({ stored: { draws: 'abc' } }).ent.canDraw(), true);
});

test('canSaveLog: 現在の保存件数で判定', () => {
  const { ent } = load();
  assert.equal(ent.canSaveLog(0), true);
  assert.equal(ent.canSaveLog(9), true);
  assert.equal(ent.canSaveLog(10), false);
  assert.equal(ent.canSaveLog(25), false);
});

test('hasProAccess: plan_type が free 以外 かつ 同じユーザーのキャッシュ', () => {
  const pro = { draws: 50, plan: 'pro', userId: USER.id, checkedAt: FRESH() };
  assert.equal(load({ stored: pro, user: USER }).ent.hasProAccess(USER), true);
  assert.equal(load({ stored: { ...pro, plan: 'free' }, user: USER }).ent.hasProAccess(USER), false);
  assert.equal(load({ stored: { ...pro, userId: 'other' }, user: USER }).ent.hasProAccess(USER), false);
  assert.equal(load({ stored: pro, user: null }).ent.hasProAccess(null), false);
});

test('PRO は ドロー・保存とも無制限', () => {
  const { ent } = load({ stored: { draws: 50, plan: 'pro', userId: USER.id, checkedAt: FRESH() }, user: USER });
  assert.equal(ent.canDraw(), true);
  assert.equal(ent.canSaveLog(100), true);
});

test('未ログインなら PRO キャッシュがあっても無料扱い', () => {
  const { ent } = load({ stored: { draws: 10, plan: 'pro', userId: USER.id, checkedAt: FRESH() }, user: null });
  assert.equal(ent.canDraw(), false);
});

test('PRO キャッシュは期限（7日）を過ぎると無料扱い', () => {
  const pro = { draws: 50, plan: 'pro', userId: USER.id };
  const at = ms => new Date(Date.now() - ms).toISOString();
  assert.equal(load({ stored: { ...pro, checkedAt: at(6 * DAY) }, user: USER }).ent.hasProAccess(USER), true);
  assert.equal(load({ stored: { ...pro, checkedAt: at(8 * DAY) }, user: USER }).ent.hasProAccess(USER), false);
  assert.equal(load({ stored: pro, user: USER }).ent.hasProAccess(USER), false);
  assert.equal(load({ stored: { ...pro, checkedAt: 'broken' }, user: USER }).ent.hasProAccess(USER), false);
});

test('フォアグラウンド復帰で plan_type を取り直し、返金済みなら free に戻る', async () => {
  const plan = { value: 'free' };
  const client = fakeClient(plan);
  const { ent, document, fire, localStorage } = load({
    stored: { draws: 50, plan: 'pro', userId: USER.id, checkedAt: FRESH() }, user: USER, client
  });
  assert.equal(ent.hasProAccess(USER), true);
  document.visibilityState = 'hidden';
  fire('visibilitychange');
  await flush();
  assert.equal(client.calls.profiles, 0);
  document.visibilityState = 'visible';
  fire('visibilitychange');
  await flush();
  assert.equal(client.calls.profiles, 1);
  assert.equal(ent.hasProAccess(USER), false);
  assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).plan, 'free');
  // 短時間の連続復帰では再取得しない
  fire('visibilitychange');
  await flush();
  assert.equal(client.calls.profiles, 1);
});

test('isProPlan / mergeDraws（大きい方を採用・加算しない）', () => {
  const { isProPlan, mergeDraws } = load().ent._pure;
  assert.equal(isProPlan('pro'), true);
  assert.equal(isProPlan('free'), false);
  assert.equal(isProPlan(''), false);
  assert.equal(isProPlan(null), false);
  assert.equal(mergeDraws(3, 7), 7);
  assert.equal(mergeDraws(8, 2), 8);
  assert.equal(mergeDraws(5, 5), 5);
  assert.equal(mergeDraws(-1, null), 0);
});

test('app.js のフックは最小限', () => {
  const app = read('app.js');
  assert.match(app, /DECIDE_ENTITLEMENTS\.canDraw\(\)\)\{ window\.DECIDE_ENTITLEMENTS\.openPaywall\('draw'\)/);
  assert.match(app, /window\.DECIDE_ENTITLEMENTS\?\.recordDraw\?\.\(\)/);
  assert.match(app, /DECIDE_ENTITLEMENTS\.canSaveLog\(logs\.length\)\)\{ window\.DECIDE_ENTITLEMENTS\.openPaywall\('save'\)/);
  assert.match(app, /startSession\(mode\)===false/);
});

test('index.html は auth → entitlements → app の順で読み込む', () => {
  const html = read('index.html');
  const order = ['./auth.js', './entitlements.js', './app.js'].map(src => html.indexOf(src));
  assert.ok(order.every(i => i >= 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('Service Worker が entitlements.js をキャッシュする', () => {
  assert.match(read('service-worker.js'), /'\.\/entitlements\.js'/);
});

test('既存の localStorage キーは変更しない', () => {
  const app = read('app.js') + read('learn.js');
  for(const key of ['decide.tarot.logs.v1', 'decide.tarot.settings.v1', 'decide.tarot.learn.v1']) {
    assert.ok(app.includes(key), key);
  }
});

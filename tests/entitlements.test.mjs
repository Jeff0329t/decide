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
function load({ stored, user = null, client = null, extra = {}, config } = {}) {
  const localStorage = memoryStorage({ ...(stored ? { [STORE_KEY]: JSON.stringify(stored) } : {}), ...extra });
  const auth = user === undefined ? undefined : {
    isEnabled: () => true,
    getUser: () => user,
    ready: () => Promise.resolve(null),
    onChange: () => {},
    client: () => client
  };
  const window = { DECIDE_AUTH: auth, DECIDE_CONFIG: config, addEventListener() {} };
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
    URL,
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

const SB_CONFIG = { SUPABASE_URL: 'https://ppuyenvuepxqqrhiswwb.supabase.co' };
const SB_SESSION_KEY = 'sb-ppuyenvuepxqqrhiswwb-auth-token';

test('オフラインでログイン状態が読めなくても、端末に残るログインの持ち主なら購入済みのまま', () => {
  const stored = { plan: 'pro', userId: USER.id, checkedAt: FRESH() };
  const session = JSON.stringify({ access_token: 'x', expires_at: 1, user: { id: USER.id } });
  const { ent } = load({ stored, user: null, config: SB_CONFIG, extra: { [SB_SESSION_KEY]: session } });
  assert.equal(ent.hasProAccess(), true);
  assert.equal(ent.hasPurchased(), true);
  assert.equal(ent.canDraw(), true);
  // Supabase 自体が読めない（auth なし）ときも同じ
  assert.equal(load({ stored, user: undefined, config: SB_CONFIG, extra: { [SB_SESSION_KEY]: session } }).ent.hasProAccess(), true);
});

test('端末に残るログインが別の人、またはログアウト済みなら購入済みにしない', () => {
  const stored = { plan: 'pro', userId: USER.id, checkedAt: FRESH() };
  const other = JSON.stringify({ user: { id: 'user-2' } });
  assert.equal(load({ stored, config: SB_CONFIG, extra: { [SB_SESSION_KEY]: other } }).ent.hasProAccess(), false);
  assert.equal(load({ stored, config: SB_CONFIG }).ent.hasProAccess(), false);
  assert.equal(load({ stored, config: SB_CONFIG, extra: { [SB_SESSION_KEY]: '{broken' } }).ent.hasProAccess(), false);
});

test('PRO キャッシュが7日を過ぎても購入済みは無料扱いに落とさない（needsOnline で再確認を促す）', () => {
  const pro = { draws: 50, plan: 'pro', userId: USER.id };
  const at = ms => new Date(Date.now() - ms).toISOString();
  assert.equal(load({ stored: { ...pro, checkedAt: at(6 * DAY) }, user: USER }).ent.hasProAccess(USER), true);
  assert.equal(load({ stored: { ...pro, checkedAt: at(8 * DAY) }, user: USER }).ent.hasProAccess(USER), true);
  assert.equal(load({ stored: pro, user: USER }).ent.hasProAccess(USER), true);
  assert.equal(load({ stored: { ...pro, checkedAt: 'broken' }, user: USER }).ent.hasProAccess(USER), true);

  const { resolveAccess } = load().ent._pure;
  assert.deepEqual({ ...resolveAccess({ plan: 'pro', userMatch: true, fresh: false }) },
    { pro: true, purchased: true, needsOnline: true });
  assert.equal(resolveAccess({ plan: 'pro', userMatch: true, fresh: true }).needsOnline, false);
  assert.deepEqual({ ...resolveAccess({ plan: 'pro', userMatch: false, fresh: true }) },
    { pro: false, purchased: false, needsOnline: false });
  // 招待特典だけの人はキャッシュの鮮度ではなく pro_until で判定し、再確認も求めない
  const now = Date.now();
  const invite = resolveAccess({ plan: 'free', proUntil: new Date(now + DAY).toISOString(), userMatch: true, fresh: false, now });
  assert.deepEqual({ ...invite }, { pro: true, purchased: false, needsOnline: false });
  assert.equal(resolveAccess({ plan: 'free', proUntil: new Date(now - DAY).toISOString(), userMatch: true, fresh: false, now }).pro, false);
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

test('needsOnline: 購入済みのキャッシュが7日を過ぎたら true、再確認できたら false', async () => {
  const stale = { draws: 50, plan: 'pro', userId: USER.id, checkedAt: new Date(Date.now() - 8 * DAY).toISOString() };
  assert.equal(load({ stored: stale, user: USER }).ent.needsOnline(), true);
  assert.equal(load({ stored: { ...stale, checkedAt: FRESH() }, user: USER }).ent.needsOnline(), false);
  assert.equal(load({ stored: { ...stale, plan: 'free' }, user: USER }).ent.needsOnline(), false);
  assert.equal(load({ stored: stale, user: null }).ent.needsOnline(), false);

  const client = fakeClient({ value: 'pro' });
  const { ent } = load({ stored: stale, user: USER, client });
  await ent.refresh();
  assert.equal(ent.needsOnline(), false);
  assert.equal(ent.hasPurchased(), true);
});

test('mountSettings: 再確認が必要なときだけ設定画面に通知欄を出す', () => {
  // 設定画面の最小限の偽物：[data-account-setting] の直後に挿入され、outerHTML='' で消える
  function fakeWrap() {
    let notice = null;
    const node = html => ({ html, set outerHTML(value) { if(value === '') notice = null; else notice = node(value); } });
    const anchor = { insertAdjacentHTML(pos, html) { assert.equal(pos, 'afterend'); notice = node(html); } };
    return {
      get notice() { return notice; },
      querySelector: sel => sel === '[data-ent-online-notice]' ? notice : sel === '[data-account-setting]' ? anchor : null
    };
  }
  const stale = { plan: 'pro', userId: USER.id, checkedAt: new Date(Date.now() - 8 * DAY).toISOString() };
  const wrap = fakeWrap();
  load({ stored: stale, user: USER }).ent.mountSettings(wrap);
  assert.match(wrap.notice.html, /data-ent-online-notice/);
  assert.match(wrap.notice.html, /data-ent-action="recheck"/);
  // 2回目は置き換え（重複しない）
  load({ stored: stale, user: USER }).ent.mountSettings(wrap);
  assert.match(wrap.notice.html, /data-ent-online-notice/);
  // 不要になったら消す
  load({ stored: { ...stale, checkedAt: FRESH() }, user: USER }).ent.mountSettings(wrap);
  assert.equal(wrap.notice, null);
  // 不要なら何も入れない
  const fresh = fakeWrap();
  load({ stored: { ...stale, checkedAt: FRESH() }, user: USER }).ent.mountSettings(fresh);
  assert.equal(fresh.notice, null);
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

test('isProActive: 買い切り or 招待特典の期限内', () => {
  const { isProActive } = load().ent._pure;
  const now = Date.now();
  assert.equal(isProActive('pro', null, now), true);
  assert.equal(isProActive('free', new Date(now + DAY).toISOString(), now), true);
  assert.equal(isProActive('free', new Date(now - DAY).toISOString(), now), false);
  assert.equal(isProActive('free', null, now), false);
  assert.equal(isProActive('free', 'invalid', now), false);
});

test('招待特典: UNLIMITEDは使えるが購入済み扱いにはしない', () => {
  const until = new Date(Date.now() + 7 * DAY).toISOString();
  const { ent } = load({ user: USER, stored: { plan: 'free', proUntil: until, userId: USER.id, checkedAt: FRESH() } });
  assert.equal(ent.hasProAccess(), true);
  assert.equal(ent.hasPurchased(), false);
  assert.equal(ent.proUntil(), until);
  assert.equal(ent.canDraw(), true);
});

test('招待特典: 期限切れなら無料枠に戻る／購入済みなら期限は出さない', () => {
  const past = new Date(Date.now() - DAY).toISOString();
  const expired = load({ user: USER, stored: { plan: 'free', proUntil: past, userId: USER.id, checkedAt: FRESH(), draws: 10 } }).ent;
  assert.equal(expired.hasProAccess(), false);
  assert.equal(expired.proUntil(), null);
  assert.equal(expired.canDraw(), false);
  const future = new Date(Date.now() + DAY).toISOString();
  const bought = load({ user: USER, stored: { plan: 'pro', proUntil: future, userId: USER.id, checkedAt: FRESH() } }).ent;
  assert.equal(bought.hasPurchased(), true);
  assert.equal(bought.proUntil(), null);
});

test('app.js のフックは最小限', () => {
  const app = read('app.js');
  assert.match(app, /DECIDE_ENTITLEMENTS\.canDraw\(\)\)\{ window\.DECIDE_ENTITLEMENTS\.openPaywall\('draw'\)/);
  assert.match(app, /window\.DECIDE_ENTITLEMENTS\?\.recordDraw\?\.\(\)/);
  assert.match(app, /DECIDE_ENTITLEMENTS\.canSaveLog\(logs\.length\)\)\{ stashBlockedSave\(log\); window\.DECIDE_ENTITLEMENTS\.openPaywall\('save'\)/);
  assert.match(app, /function restoreBlockedSave\(\)/);
  assert.match(app, /visibilitychange[\s\S]{0,120}restoreBlockedSave/);
  assert.match(app, /startSession\(mode\)===false/);
  assert.match(app, /window\.DECIDE_ENTITLEMENTS\?\.mountSettings\?\.\(wrap\)/);
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

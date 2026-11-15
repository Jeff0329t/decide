import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const STORE_KEY = 'decide.partner.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  };
}

// partner.js を最小限のブラウザ環境で読み込む
function load({ href = 'https://x.test/', auth, initial } = {}) {
  const localStorage = memoryStorage(initial);
  const replaced = [];
  const url = new URL(href);
  const window = auth ? { DECIDE_AUTH: auth } : {};
  const sandbox = {
    window, localStorage, URL, console,
    location: { href, origin: url.origin, pathname: url.pathname },
    history: { state: null, replaceState(state, title, next) { replaced.push(next); } }
  };
  vm.runInNewContext(read('dist/partner.js'), sandbox);
  return { partner: window.DECIDE_PARTNER, localStorage, replaced };
}

const { normalizeCode, takeViaFromUrl, isExpired } = load().partner._pure;
const stored = (code, ageMs) => JSON.stringify({ code, captured_at: new Date(Date.now() - ageMs).toISOString() });

test('normalizeCode: 小文字スラッグだけを通し、大文字は小文字にそろえる', () => {
  assert.equal(normalizeCode(' facehouse '), 'facehouse');
  assert.equal(normalizeCode('Kao-No-Ie'), 'kao-no-ie');
  assert.equal(normalizeCode('ab'), '');
  assert.equal(normalizeCode('ABC12345'), 'abc12345'); // 友だち招待コードの形でも、店舗コードとしては小文字化して扱う
  assert.equal(normalizeCode('kao no ie'), '');
  assert.equal(normalizeCode(null), '');
});

test('takeViaFromUrl: via を取り出し、ref など他のパラメータは残す', () => {
  const plain = v => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(takeViaFromUrl('https://x.test/en/?via=facehouse&lang=en#top')), { code: 'facehouse', cleaned: '/en/?lang=en#top' });
  assert.deepEqual(plain(takeViaFromUrl('https://x.test/?via=facehouse&ref=ABCD2345')), { code: 'facehouse', cleaned: '/?ref=ABCD2345' });
  assert.deepEqual(plain(takeViaFromUrl('https://x.test/?ref=ABCD2345')), { code: '', cleaned: '' });
  assert.deepEqual(plain(takeViaFromUrl('not a url')), { code: '', cleaned: '' });
});

test('isExpired: 30日ちょうどは有効、30日を過ぎたら期限切れ', () => {
  const now = Date.parse('2026-11-16T00:00:00.000Z');
  assert.equal(isExpired('2026-10-17T00:00:00.000Z', now), false);
  assert.equal(isExpired('2026-10-16T23:59:59.000Z', now), true);
  assert.equal(isExpired('not-a-date', now), true);
});

test('読み込み時: ?via= を保存してアドレスバーから消す（ref は残す）', () => {
  const { partner, localStorage, replaced } = load({ href: 'https://x.test/en/?via=facehouse&ref=ABCD2345' });
  const entry = partner.pendingCapture();
  assert.equal(entry.code, 'facehouse');
  assert.ok(Math.abs(Date.now() - Date.parse(entry.captured_at)) < 5000);
  assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).code, 'facehouse');
  assert.deepEqual(replaced, ['/en/?ref=ABCD2345']);
});

test('ファーストタッチ: 有効な紹介が保存済みなら、別の店舗の ?via= で上書きしない', () => {
  const { partner, localStorage, replaced } = load({
    href: 'https://x.test/?via=othershop',
    initial: { [STORE_KEY]: stored('facehouse', 1 * DAY_MS) }
  });
  assert.equal(partner.pendingCapture().code, 'facehouse');
  assert.equal(JSON.parse(localStorage.getItem(STORE_KEY)).code, 'facehouse');
  assert.deepEqual(replaced, ['/']); // アドレスバーの掃除だけは行う
});

test('期限切れの紹介は、新しい ?via= で置き換わる', () => {
  const { partner } = load({
    href: 'https://x.test/?via=othershop',
    initial: { [STORE_KEY]: stored('facehouse', 31 * DAY_MS) }
  });
  assert.equal(partner.pendingCapture().code, 'othershop');
});

test('pendingCapture: 期限切れは消して null を返す', () => {
  const { partner, localStorage } = load({ initial: { [STORE_KEY]: stored('facehouse', 31 * DAY_MS) } });
  assert.equal(partner.pendingCapture(), null);
  assert.equal(localStorage.getItem(STORE_KEY), null);
});

test('?ref= だけのURLでは何も保存せず、アドレスバーにも触れない（友だち招待と非干渉）', () => {
  const { partner, localStorage, replaced } = load({ href: 'https://x.test/?ref=ABCD2345' });
  assert.equal(partner.pendingCapture(), null);
  assert.equal(localStorage.getItem(STORE_KEY), null);
  assert.deepEqual(replaced, []);
});

function authWithRpc(result, rpcError = null) {
  const calls = [];
  const user = { id: 'u1' };
  const auth = {
    getUser: () => user,
    ready: () => Promise.resolve(user),
    onChange() {},
    client: () => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: result, error: rpcError }; } })
  };
  return { auth, calls };
}

test('ログイン時: 保存済みの紹介を RPC でサーバーに記録し、確定したら保存を消す', async () => {
  for (const result of ['ok', 'already', 'expired', 'invalid']) {
    const { auth, calls } = authWithRpc(result);
    const { localStorage } = load({ auth, initial: { [STORE_KEY]: stored('facehouse', 2 * DAY_MS) } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls.length, 1, result);
    assert.equal(calls[0][0], 'bind_partner_attribution');
    assert.equal(calls[0][1].p_code, 'facehouse');
    assert.ok(calls[0][1].p_captured_at);
    assert.equal(localStorage.getItem(STORE_KEY), null, result);
  }
});

test('ログイン時: RPC が失敗したら保存を残して次回に回す', async () => {
  const { auth, calls } = authWithRpc(null, { message: 'boom' });
  const { localStorage } = load({ auth, initial: { [STORE_KEY]: stored('facehouse', 2 * DAY_MS) } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.ok(localStorage.getItem(STORE_KEY));
});

test('未ログイン・紹介なしでは RPC を呼ばない', async () => {
  const { auth, calls } = authWithRpc('ok');
  load({ auth });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls, []);
});

test('組み込み: アプリ本体と英語版の入口の両方で ?via= を受け取る', () => {
  assert.match(read('dist/index.html'), /<script src="\.\/partner\.js" defer><\/script>/);
  const en = read('dist/en/index.html');
  assert.match(en, /searchParams\.has\('via'\)/);
  assert.match(en, /decide\.partner\.v1/);
  const sw = read('dist/service-worker.js');
  assert.match(sw, /'\.\/partner\.js'/);
});

test('マイグレーション: 5テーブルと RPC、二重計上を防ぐ制約がある', () => {
  const sql = read('supabase/migrations/20261116000000_partner_referrals.sql');
  for (const table of ['partner_channels', 'partner_attributions', 'partner_conversions', 'partner_notification_log', 'partner_payouts']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`), table);
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from authenticated`), table);
  }
  // 成果は1決済1行（主キー）＋紐づけは利用者1行（主キー）で二重計上を構造的に防ぐ
  assert.match(sql, /checkout_session_id text primary key references public\.purchases/);
  assert.match(sql, /user_id uuid primary key references auth\.users/);
  assert.match(sql, /unique \(partner_code, window_end\)/);
  assert.match(sql, /create or replace function public\.bind_partner_attribution\(p_code text, p_captured_at timestamptz\)/);
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /on conflict \(user_id\) do nothing/);
  assert.match(sql, /grant execute on function public\.bind_partner_attribution\(text, timestamptz\) to authenticated/);
});

test('create-checkout: サーバー側の紐づけから紹介コードをメタデータに付ける', () => {
  const src = read('supabase/functions/create-checkout/index.ts');
  assert.match(src, /from\('partner_attributions'\)/);
  assert.match(src, /from\('partner_channels'\)/);
  assert.match(src, /if \(partnerCode\) metadata\.partner_code = partnerCode;/);
  // 冪等性の前提（パラメータにリクエストごとの値を持たない）は崩さない
  const body = src.slice(src.indexOf('const params = {'), src.indexOf('const lockId ='));
  assert.doesNotMatch(body, /Date\.now|Math\.random|randomUUID|expires_at/);
});

test('stripe-webhook: 成果は1利用者1件だけ立ち、二重計上しない', () => {
  const src = read('supabase/functions/stripe-webhook/index.ts');
  const conv = src.slice(src.indexOf('async function recordPartnerConversion'), src.indexOf('async function onChargeRefunded'));
  assert.match(conv, /session\.metadata\?\.partner_code/);
  assert.match(conv, /from\('partner_attributions'\)/); // メタデータが無い場合のフォールバック
  assert.match(conv, /bound_at/);
  assert.match(conv, /from\('partner_conversions'\)[\s\S]*?count: 'exact'[\s\S]*?status', 'confirmed'/);
  assert.match(conv, /from\('partner_conversions'\)\.upsert/);
  assert.match(conv, /onConflict: 'checkout_session_id', ignoreDuplicates: true/);
  assert.match(conv, /reward_jpy: channel\.reward_jpy/); // 報酬単価は購入時点のスナップショット
  const completed = src.slice(src.indexOf('async function onCheckoutCompleted'), src.indexOf('async function recordPartnerConversion'));
  assert.match(completed, /await recordPartnerConversion\(session, userId\)/);
});

test('stripe-webhook: 全額返金で成果も refunded になり、チャージバックでは disputed の印が付く', () => {
  const src = read('supabase/functions/stripe-webhook/index.ts');
  const refund = src.slice(src.indexOf('async function onChargeRefunded'), src.indexOf('async function onDispute'));
  assert.match(refund, /from\('partner_conversions'\)[\s\S]*?status: 'refunded'/);
  const dispute = src.slice(src.indexOf('async function onDispute'), src.indexOf('async function findUserId'));
  assert.match(dispute, /from\('partner_conversions'\)[\s\S]*?status: 'disputed'/);
});

test('顔の家のマスタ登録SQL: 報酬200円・メール未設定で用意されている', () => {
  const sql = read('supabase/partner-channel-facehouse.sql');
  assert.match(sql, /'facehouse', '顔の家', null, 200, true/);
  assert.match(sql, /decisionprocess\.net\/en\/\?via=facehouse/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const helper = await import('../supabase/functions/create-checkout/checkout-idempotency.ts');
const { checkoutIdempotencyKey, createCheckoutUrl, BUCKET_SECONDS } = helper;
const indexSrc = fs.readFileSync(new URL('../supabase/functions/create-checkout/index.ts', import.meta.url), 'utf8');

const params = (base = 'https://decisionprocess.net', email = 'a@example.com') => ({
  mode: 'payment',
  line_items: [{ quantity: 1, price_data: { currency: 'jpy', unit_amount: 980 } }],
  client_reference_id: 'user-1',
  customer_email: email,
  metadata: { user_id: 'user-1', product: 'decide_pro_lifetime' },
  success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${base}/?checkout=cancel`,
});

// Mock Stripe that behaves like the real idempotency layer: same key + same body -> same session,
// same key + different body -> 400 idempotency_error, same key while the first call is in flight -> 409.
function mockStripe({ latencyMs = 20, conflictWhileInFlight = false } = {}) {
  const byKey = new Map();
  const inFlight = new Set();
  let seq = 0;
  const created = [];
  const create = async (body, options = {}) => {
    const key = options.idempotencyKey;
    const bodyJson = JSON.stringify(body);
    if (key && byKey.has(key)) {
      const prev = await byKey.get(key);
      if (prev.bodyJson !== bodyJson) throw Object.assign(new Error('Keys for idempotent requests can only be used with the same parameters'), { type: 'StripeIdempotencyError', statusCode: 400 });
      return prev.session;
    }
    if (key && conflictWhileInFlight && inFlight.has(key)) {
      throw Object.assign(new Error('idempotency key in use'), { type: 'StripeInvalidRequestError', code: 'idempotency_key_in_use', statusCode: 409 });
    }
    const work = (async () => {
      if (key) inFlight.add(key);
      await new Promise(r => setTimeout(r, latencyMs));
      const session = { id: `cs_test_${++seq}`, url: `https://checkout.stripe.test/c/${seq}` };
      created.push(session);
      if (key) inFlight.delete(key);
      return { bodyJson, session };
    })();
    if (key && !conflictWhileInFlight) byKey.set(key, work);
    const done = await work;
    if (key && conflictWhileInFlight) byKey.set(key, Promise.resolve(done));
    return done.session;
  };
  return { create, created };
}

// Same flow as index.ts after findOpenSession found nothing (both requests saw an empty list).
async function request(stripe, p, nowMs, find = async () => null) {
  const key = await checkoutIdempotencyKey('user-1', p, nowMs);
  return createCheckoutUrl((body, opts) => stripe.create(body, opts), p, key, find, { delayMs: 15 });
}

test('同時に2リクエストしても同じ決済URLが返り、セッションは1つだけ作られる', async () => {
  const stripe = mockStripe();
  const now = Date.UTC(2026, 9, 12, 3, 1, 0);
  const [a, b] = await Promise.all([request(stripe, params(), now), request(stripe, params(), now + 1500)]);
  assert.equal(a, b);
  assert.equal(stripe.created.length, 1);
});

test('Stripe が処理中のキーに409を返しても、再試行で同じURLになる', async () => {
  const stripe = mockStripe({ conflictWhileInFlight: true });
  const now = Date.UTC(2026, 9, 12, 3, 1, 0);
  const [a, b] = await Promise.all([request(stripe, params(), now), request(stripe, params(), now)]);
  assert.equal(a, b);
  assert.equal(stripe.created.length, 1);
});

test('冪等キーはユーザー・時間枠・リクエスト内容で決まる', async () => {
  const now = Date.UTC(2026, 9, 12, 3, 1, 0);
  const k = await checkoutIdempotencyKey('user-1', params(), now);
  assert.match(k, /^decide-checkout:v1:user-1:\d+:[0-9a-f]{32}$/);
  assert.ok(k.length <= 255);
  assert.equal(await checkoutIdempotencyKey('user-1', params(), now + 1000), k);
  assert.notEqual(await checkoutIdempotencyKey('user-2', params(), now), k);
  assert.notEqual(await checkoutIdempotencyKey('user-1', params('http://localhost:5173'), now), k);
  assert.notEqual(await checkoutIdempotencyKey('user-1', params(), now + BUCKET_SECONDS * 1000), k);
});

test('同じキーで内容が違う(400)場合は開いているセッションを返すか、別キーで1回だけ作る', async () => {
  const mismatch = Object.assign(new Error('mismatch'), { type: 'StripeIdempotencyError', statusCode: 400 });
  const keys = [];
  const create = async (_p, opts) => { keys.push(opts.idempotencyKey); if (keys.length === 1) throw mismatch; return { url: 'https://checkout.stripe.test/new' }; };
  assert.equal(await createCheckoutUrl(create, {}, 'k', async () => 'https://checkout.stripe.test/open'), 'https://checkout.stripe.test/open');
  keys.length = 0;
  assert.equal(await createCheckoutUrl(create, {}, 'k', async () => null), 'https://checkout.stripe.test/new');
  assert.equal(keys.length, 2);
  assert.notEqual(keys[1], 'k');
});

test('その他の Stripe エラーはそのまま投げる(502になる)', async () => {
  const create = async () => { throw Object.assign(new Error('card'), { type: 'StripeAPIError', statusCode: 500 }); };
  await assert.rejects(createCheckoutUrl(create, {}, 'k', async () => null), /card/);
});

test('index.ts は sessions.create に冪等キーを渡し、本文に時刻や乱数を入れない', () => {
  assert.match(indexSrc, /checkoutIdempotencyKey\(user\.id, params\)/);
  assert.match(indexSrc, /stripe\.checkout\.sessions\.create\(p as Stripe\.Checkout\.SessionCreateParams, options\)/);
  const body = indexSrc.slice(indexSrc.indexOf('const params = {'), indexSrc.indexOf('const key ='));
  assert.doesNotMatch(body, /Date\.now|Math\.random|randomUUID|expires_at/);
});

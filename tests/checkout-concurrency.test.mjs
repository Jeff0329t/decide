import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const helper = await import('../supabase/functions/create-checkout/checkout-idempotency.ts');
const { obtainCheckoutUrl, createCheckoutSession, checkoutIdempotencyKey, CheckoutBusyError } = helper;
const indexSrc = fs.readFileSync(new URL('../supabase/functions/create-checkout/index.ts', import.meta.url), 'utf8');
const migrationSrc = fs.readFileSync(new URL('../supabase/migrations/20261012020000_checkout_locks.sql', import.meta.url), 'utf8');

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));
const params = { mode: 'payment', metadata: { user_id: 'user-1', product: 'decide_pro_lifetime' } };

// Virtual clock shared by the lock store and Stripe (seconds precision is irrelevant: we use ms).
function clock(startMs) {
  let now = startMs;
  return { now: () => now, set: (ms) => { now = ms; }, advance: (ms) => { now += ms; } };
}

// In-memory checkout_locks that mirrors claim_checkout_lock / complete_checkout_lock / release_checkout_lock.
// Every call awaits a tick so concurrent requests really interleave; each call body is atomic like one SQL statement.
function lockDb(clk) {
  const rows = new Map(); // `${user}|${product}` -> { lockId, sessionId, sessionUrl, expiresAt }
  const claims = [];
  const storeFor = (user, product) => {
    const k = `${user}|${product}`;
    return {
      async claim(lockId, ttlSeconds, staleLockId) {
        await tick();
        const row = rows.get(k);
        if (!row || row.expiresAt < clk.now() || (staleLockId && row.lockId === staleLockId)) {
          rows.set(k, { lockId, sessionId: null, sessionUrl: null, expiresAt: clk.now() + ttlSeconds * 1000 });
          claims.push(lockId);
          return { won: true, lockId, sessionId: null, sessionUrl: null };
        }
        return { won: false, lockId: row.lockId, sessionId: row.sessionId, sessionUrl: row.sessionUrl };
      },
      async get() {
        await tick();
        const row = rows.get(k);
        return row ? { lockId: row.lockId, sessionId: row.sessionId, sessionUrl: row.sessionUrl } : null;
      },
      async setSession(lockId, session, ttlSeconds) {
        await tick();
        const row = rows.get(k);
        if (!row || row.lockId !== lockId) return false;
        Object.assign(row, { sessionId: session.id, sessionUrl: session.url, expiresAt: clk.now() + ttlSeconds * 1000 });
        return true;
      },
      async release(lockId) {
        await tick();
        if (rows.get(k)?.lockId === lockId) rows.delete(k);
      },
    };
  };
  return { storeFor, rows, claims };
}

// Mock Stripe: same idempotency key -> same session, 400 on body mismatch. Sessions can be closed (paid/expired).
function mockStripe({ createDelayMs = 30, findDelayMs = 20 } = {}) {
  const byKey = new Map();
  const sessions = [];
  let seq = 0;
  const create = async (body, { idempotencyKey: key }) => {
    const bodyJson = JSON.stringify(body);
    if (byKey.has(key)) {
      const prev = await byKey.get(key);
      if (prev.bodyJson !== bodyJson) throw Object.assign(new Error('mismatch'), { type: 'StripeIdempotencyError', statusCode: 400 });
      return prev.session;
    }
    const work = (async () => {
      await tick(createDelayMs);
      const session = { id: `cs_test_${++seq}`, url: `https://checkout.stripe.test/c/${seq}`, product: body.metadata.product, open: true };
      sessions.push(session);
      return { bodyJson, session };
    })();
    byKey.set(key, work);
    return (await work).session;
  };
  // Snapshot at call time, returned after a delay: the window between find and create is real.
  const findFor = (product) => async () => {
    const snapshot = sessions.find((s) => s.open && s.product === product);
    await tick(findDelayMs);
    return snapshot ? { id: snapshot.id, url: snapshot.url } : null;
  };
  const isOpen = async (id) => { await tick(); return !!sessions.find((s) => s.id === id)?.open; };
  return { create, findFor, isOpen, sessions, keys: () => [...byKey.keys()] };
}

let seq = 0;
const request = (db, stripe, { user = 'user-1', product = 'decide_pro_lifetime', ...opts } = {}) =>
  obtainCheckoutUrl({
    store: db.storeFor(user, product),
    find: stripe.findFor(product),
    isOpen: stripe.isOpen,
    create: stripe.create,
    params: { ...params, metadata: { user_id: user, product } },
    lockId: `lock-${++seq}`,
    pollDelaysMs: [5, 10, 20, 40, 80, 80, 80, 80],
    sleep: (ms) => tick(ms),
    ...opts,
  });

test('時間枠の境目(03:09:59.999 / 03:10:00.000)をまたぐ2リクエスト + find/create 間の遅延でも、作成は1回で同じURL', async () => {
  const clk = clock(Date.UTC(2026, 9, 12, 3, 9, 59, 999));
  const db = lockDb(clk);
  const stripe = mockStripe({ findDelayMs: 40, createDelayMs: 40 });
  const a = request(db, stripe);
  await tick(1);
  clk.set(Date.UTC(2026, 9, 12, 3, 10, 0, 0));
  const b = request(db, stripe);
  const [ua, ub] = await Promise.all([a, b]);
  assert.equal(ua, ub);
  assert.equal(stripe.sessions.length, 1);
  assert.equal(stripe.keys().length, 1);
  assert.match(stripe.keys()[0], /^decide-checkout:v2:lock-\d+$/);
});

test('20件同時でもセッションは1つ、全員が同じURL', async () => {
  const db = lockDb(clock(Date.UTC(2026, 9, 12, 3, 0, 0)));
  const stripe = mockStripe({ createDelayMs: 60 });
  const urls = await Promise.all(Array.from({ length: 20 }, () => request(db, stripe)));
  assert.equal(new Set(urls).size, 1);
  assert.equal(stripe.sessions.length, 1);
  assert.equal(db.claims.length, 1);
});

test('完了後のリクエストはロックに保存されたセッションをそのまま返す', async () => {
  const db = lockDb(clock(Date.UTC(2026, 9, 12, 3, 0, 0)));
  const stripe = mockStripe();
  const first = await request(db, stripe);
  assert.equal(await request(db, stripe), first);
  assert.equal(stripe.sessions.length, 1);
});

test('ロックのセッションがもう開いていない(支払済み/期限切れ)なら、期限内でも引き継いで新しいセッションを作る', async () => {
  const db = lockDb(clock(Date.UTC(2026, 9, 12, 3, 0, 0)));
  const stripe = mockStripe();
  const first = await request(db, stripe);
  stripe.sessions[0].open = false;
  const [a, b] = await Promise.all([request(db, stripe), request(db, stripe)]);
  assert.notEqual(a, first);
  assert.equal(a, b);
  assert.equal(stripe.sessions.length, 2);
});

test('作成途中で落ちたロック(期限切れ)は次のリクエストが引き継げる', async () => {
  const clk = clock(Date.UTC(2026, 9, 12, 3, 0, 0));
  const db = lockDb(clk);
  const stripe = mockStripe();
  await db.storeFor('user-1', 'decide_pro_lifetime').claim('crashed', 60, null);
  clk.advance(61_000);
  const url = await request(db, stripe);
  assert.equal(url, stripe.sessions[0].url);
  assert.equal(stripe.sessions.length, 1);
});

test('期限切れのロックでも Stripe に開いているセッションがあればそれを再利用する', async () => {
  const clk = clock(Date.UTC(2026, 9, 12, 3, 0, 0));
  const db = lockDb(clk);
  const stripe = mockStripe();
  const first = await request(db, stripe);
  clk.advance(31 * 60_000);
  assert.equal(await request(db, stripe), first);
  assert.equal(stripe.sessions.length, 1);
});

test('作成に失敗したらロックを解放し、次のリクエストはすぐ成功する', async () => {
  const db = lockDb(clock(Date.UTC(2026, 9, 12, 3, 0, 0)));
  const stripe = mockStripe();
  const failing = async () => { await tick(5); throw Object.assign(new Error('stripe down'), { type: 'StripeAPIError', statusCode: 500 }); };
  await assert.rejects(request(db, stripe, { create: failing }), /stripe down/);
  assert.equal(db.rows.size, 0);
  const url = await request(db, stripe);
  assert.equal(url, stripe.sessions[0].url);
});

test('勝者が失敗しても、待っていたリクエストはロックを取り直して1つだけ作る', async () => {
  const db = lockDb(clock(Date.UTC(2026, 9, 12, 3, 0, 0)));
  const stripe = mockStripe();
  const failing = async () => { await tick(20); throw new Error('boom'); };
  const results = await Promise.allSettled([
    request(db, stripe, { create: failing }),
    request(db, stripe),
    request(db, stripe),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].value, results[2].value);
  assert.equal(stripe.sessions.length, 1);
});

test('商品が違えばロックは独立している', async () => {
  const db = lockDb(clock(Date.UTC(2026, 9, 12, 3, 0, 0)));
  const stripe = mockStripe();
  const [a, b] = await Promise.all([request(db, stripe), request(db, stripe, { product: 'other_product' })]);
  assert.notEqual(a, b);
  assert.equal(stripe.sessions.length, 2);
  assert.equal(db.rows.size, 2);
});

test('勝者が終わらないまま待ち時間を使い切ったら CheckoutBusyError(503)', async () => {
  const db = lockDb(clock(Date.UTC(2026, 9, 12, 3, 0, 0)));
  const stripe = mockStripe();
  await db.storeFor('user-1', 'decide_pro_lifetime').claim('slow-owner', 60, null);
  await assert.rejects(request(db, stripe, { pollDelaysMs: [1, 1, 1], maxRounds: 2 }), CheckoutBusyError);
  assert.equal(stripe.sessions.length, 0);
});

test('createCheckoutSession: 409(処理中)は同じキーで再試行する', async () => {
  let calls = 0;
  const create = async (_p, opts) => {
    calls++;
    assert.equal(opts.idempotencyKey, 'k');
    if (calls === 1) throw Object.assign(new Error('in use'), { code: 'idempotency_key_in_use', statusCode: 409 });
    return { id: 'cs_1', url: 'https://checkout.stripe.test/1' };
  };
  const s = await createCheckoutSession(create, {}, 'k', async () => null, { sleep: () => tick() });
  assert.deepEqual(s, { id: 'cs_1', url: 'https://checkout.stripe.test/1' });
  assert.equal(calls, 2);
});

test('createCheckoutSession: 同じキーで内容が違う(400)場合は開いているセッションを返すか、別キーで1回だけ作る', async () => {
  const mismatch = Object.assign(new Error('mismatch'), { type: 'StripeIdempotencyError', statusCode: 400 });
  const keys = [];
  const create = async (_p, opts) => { keys.push(opts.idempotencyKey); if (keys.length === 1) throw mismatch; return { id: 'cs_new', url: 'https://checkout.stripe.test/new' }; };
  const open = { id: 'cs_open', url: 'https://checkout.stripe.test/open' };
  assert.deepEqual(await createCheckoutSession(create, {}, 'k', async () => open), open);
  keys.length = 0;
  assert.equal((await createCheckoutSession(create, {}, 'k', async () => null)).url, 'https://checkout.stripe.test/new');
  assert.equal(keys.length, 2);
  assert.notEqual(keys[1], 'k');
});

test('createCheckoutSession: その他の Stripe エラーはそのまま投げる(502になる)', async () => {
  const create = async () => { throw Object.assign(new Error('card'), { type: 'StripeAPIError', statusCode: 500 }); };
  await assert.rejects(createCheckoutSession(create, {}, 'k', async () => null), /card/);
});

test('冪等キーはロックIDから決まり、時間枠を含まない', () => {
  assert.equal(checkoutIdempotencyKey('0b6f9b8e-0000-4000-8000-000000000000'), 'decide-checkout:v2:0b6f9b8e-0000-4000-8000-000000000000');
  assert.equal(typeof helper.BUCKET_SECONDS, 'undefined');
  const helperSrc = fs.readFileSync(new URL('../supabase/functions/create-checkout/checkout-idempotency.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(helperSrc, /BUCKET_SECONDS|bucketKey|accepted risk|10-minute/i);
});

test('migration: 主キー(user_id, product)・原子的な取得・RLS有効でポリシーなし・anon/authenticated は権限なし', () => {
  const sql = migrationSrc.replace(/--.*$/gm, '');
  assert.match(sql, /create table if not exists public\.checkout_locks/);
  assert.match(sql, /primary key \(user_id, product\)/);
  assert.match(sql, /on conflict \(user_id, product\) do update/);
  assert.match(sql, /where l\.expires_at < now\(\)/);
  assert.match(sql, /returning l\.lock_id into v_won/);
  assert.match(sql, /alter table public\.checkout_locks enable row level security/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /revoke all on public\.checkout_locks from anon/);
  assert.match(sql, /revoke all on public\.checkout_locks from authenticated/);
  for (const fn of ['claim_checkout_lock', 'complete_checkout_lock', 'release_checkout_lock']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
  }
  assert.equal((sql.match(/security definer/g) ?? []).length, 3);
  assert.equal((sql.match(/set search_path = public/g) ?? []).length, 3);
});

test('index.ts: DBロック経由で作成し、時間枠キーを使わず、作成中は503(409は「購入済み」表示になるため使わない)', () => {
  assert.match(indexSrc, /obtainCheckoutUrl\(/);
  assert.match(indexSrc, /crypto\.randomUUID\(\)/);
  assert.match(indexSrc, /admin\.rpc\('claim_checkout_lock'/);
  assert.match(indexSrc, /admin\.rpc\('complete_checkout_lock'/);
  assert.match(indexSrc, /admin\.rpc\('release_checkout_lock'/);
  assert.doesNotMatch(indexSrc, /BUCKET|10-minute|createCheckoutUrl/);
  assert.match(indexSrc, /CheckoutBusyError[\s\S]{0,300}status: 503/);
  assert.match(indexSrc, /'Retry-After'/);
  assert.match(indexSrc, /stripe\.checkout\.sessions\.create\(p as Stripe\.Checkout\.SessionCreateParams, options\)/);
  const body = indexSrc.slice(indexSrc.indexOf('const params = {'), indexSrc.indexOf('const lockId ='));
  assert.ok(body.length > 100);
  assert.doesNotMatch(body, /Date\.now|Math\.random|randomUUID|expires_at/);
});

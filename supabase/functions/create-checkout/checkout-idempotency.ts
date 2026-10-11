// Pure helpers that make Checkout session creation idempotent across concurrent requests.
// No Deno / Stripe imports here so the logic can be unit-tested from Node (tests/checkout-concurrency.test.mjs).
//
// Why: "look for an open session, otherwise create one" is not atomic. Two tabs / a double tap can both see
// nothing and each create a session. Passing the same Stripe idempotency key for identical requests makes Stripe
// return the first session to every caller in the same time window.
//
// Residual risk (documented, accepted): two requests that straddle a bucket boundary (e.g. 12:09:59.9 and
// 12:10:00.1) get different keys and can still create two sessions. The window is only the few hundred ms between
// findOpenSession and create, and the second request normally sees the first session via findOpenSession.
// Double payments that slip through are handled by stripe-webhook (purchases table / single refund keeps PRO).

export const BUCKET_SECONDS = 600; // 10 minutes

type CreateFn<T> = (params: unknown, options: { idempotencyKey: string }) => Promise<T>;
type FindFn = () => Promise<string | null>;

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

// Key = user + time bucket + hash of the exact request body. Everything that goes into the body (product, price,
// return URLs i.e. base origin, email, metadata) is covered by the hash, so a body that differs gets a different key
// and Stripe never sees "same key, different parameters". The body must not contain per-request values
// (timestamps, random ids); if it ever does, they change the hash and simply disable dedup instead of erroring.
export async function checkoutIdempotencyKey(userId: string, params: unknown, nowMs: number = Date.now()): Promise<string> {
  const bucket = Math.floor(nowMs / 1000 / BUCKET_SECONDS);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(params)));
  return `decide-checkout:v1:${userId}:${bucket}:${toHex(digest).slice(0, 32)}`;
}

const errorInfo = (error: unknown) => {
  const e = (error ?? {}) as { type?: string; rawType?: string; code?: string; statusCode?: number };
  return { type: e.type ?? e.rawType ?? '', code: e.code ?? '', status: e.statusCode ?? 0 };
};

// Another request with the same key is still in flight at Stripe (HTTP 409). Waiting and retrying with the
// same key returns that request's session.
export const isKeyInUse = (error: unknown) => {
  const { code, status, type } = errorInfo(error);
  return code === 'idempotency_key_in_use' || (status === 409 && type !== 'StripeIdempotencyError' && type !== 'idempotency_error');
};

// Same key was used with different parameters (HTTP 400, idempotency_error).
export const isKeyMismatch = (error: unknown) => {
  const { type } = errorInfo(error);
  return type === 'StripeIdempotencyError' || type === 'idempotency_error';
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Creates (or receives the already-created) session for this key and returns its URL.
// - key in use (409): back off and retry with the same key, up to `attempts` times.
// - key mismatch (400): reuse an open session if one exists, otherwise create once with a fresh derived key.
export async function createCheckoutUrl<T extends { url?: string | null }>(
  create: CreateFn<T>,
  params: unknown,
  key: string,
  find: FindFn,
  { attempts = 3, delayMs = 400 }: { attempts?: number; delayMs?: number } = {},
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const session = await create(params, { idempotencyKey: key });
      if (!session.url) throw new Error('checkout session has no url');
      return session.url;
    } catch (error) {
      if (isKeyInUse(error) && attempt < attempts) {
        await sleep(delayMs * attempt);
        continue;
      }
      if (isKeyMismatch(error)) {
        const reusable = await find();
        if (reusable) return reusable;
        const retry = await create(params, { idempotencyKey: `${key}:r${Date.now().toString(36)}` });
        if (!retry.url) throw new Error('checkout session has no url');
        return retry.url;
      }
      throw error;
    }
  }
}

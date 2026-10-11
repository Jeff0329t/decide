// Pure orchestration that guarantees at most one Stripe Checkout session per pending purchase (user x product).
// No Deno / Stripe / Supabase imports here: every side effect is injected, so the logic is unit-tested from Node
// (tests/checkout-concurrency.test.mjs).
//
// Why: "look for an open session, otherwise create one" is not atomic. Two tabs / a double tap / a slow network
// retry can all see nothing and each create a session. A time-bucketed idempotency key does not fix this: two
// requests that straddle a bucket boundary get different keys.
//
// How: the right to create is claimed atomically in the DB (public.checkout_locks, one row per user x product,
// claimed with INSERT ... ON CONFLICT DO UPDATE ... WHERE expired). Exactly one request wins:
// - winner: reuse an open session if Stripe already has one, otherwise create one with an idempotency key derived
//   from its lock id, then store the session on the lock (TTL extended to SESSION_TTL_SECONDS).
//   Any failure releases the lock so the next attempt can start immediately.
// - loser:  if the lock already holds a session that is still open, return it. If that session is no longer open
//   (paid / expired), take the lock over (claim with staleLockId) and become the winner. If the winner is still
//   creating, poll the lock with bounded backoff; if it never completes, fall back to find(), else CheckoutBusyError.
// The claim TTL is short (CLAIM_TTL_SECONDS) so a crashed winner blocks others for at most that long.

export const CLAIM_TTL_SECONDS = 60;
export const SESSION_TTL_SECONDS = 30 * 60;
export const POLL_DELAYS_MS = [100, 200, 400, 800, 1000, 1000, 1000, 1000];
export const MAX_ROUNDS = 4;

export type Session = { id: string; url: string };

export type LockRow = { lockId: string; sessionId: string | null; sessionUrl: string | null };
export type ClaimResult = LockRow & { won: boolean };

export interface LockStore {
  // Atomically claim the lock with `lockId`. Wins if there is no row, the row is expired, or its lock id equals
  // `staleLockId`. Otherwise returns the current row with won=false.
  claim(lockId: string, ttlSeconds: number, staleLockId: string | null): Promise<ClaimResult>;
  get(): Promise<LockRow | null>;
  // Store the created session on our lock (no-op if the lock is no longer ours) and extend its TTL.
  setSession(lockId: string, session: Session, ttlSeconds: number): Promise<boolean>;
  // Delete the lock if it is still ours.
  release(lockId: string): Promise<void>;
}

type CreateFn<T> = (params: unknown, options: { idempotencyKey: string }) => Promise<T>;
type FindFn = () => Promise<Session | null>;

export class CheckoutBusyError extends Error {
  constructor() {
    super('checkout session is being created by another request');
    this.name = 'CheckoutBusyError';
  }
}

export const checkoutIdempotencyKey = (lockId: string) => `decide-checkout:v2:${lockId}`;

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

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const asSession = (s: { id?: string; url?: string | null }): Session => {
  if (!s.url || !s.id) throw new Error('checkout session has no url');
  return { id: s.id, url: s.url };
};

// Creates (or receives the already-created) session for this key.
// - key in use (409): back off and retry with the same key, up to `attempts` times.
// - key mismatch (400): reuse an open session if one exists, otherwise create once with a fresh derived key.
export async function createCheckoutSession<T extends { id?: string; url?: string | null }>(
  create: CreateFn<T>,
  params: unknown,
  key: string,
  find: FindFn,
  { attempts = 3, delayMs = 400, sleep = defaultSleep }: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Session> {
  for (let attempt = 1; ; attempt++) {
    try {
      return asSession(await create(params, { idempotencyKey: key }));
    } catch (error) {
      if (isKeyInUse(error) && attempt < attempts) {
        await sleep(delayMs * attempt);
        continue;
      }
      if (isKeyMismatch(error)) {
        const reusable = await find();
        if (reusable) return reusable;
        return asSession(await create(params, { idempotencyKey: `${key}:r${Date.now().toString(36)}` }));
      }
      throw error;
    }
  }
}

export type ObtainDeps<T> = {
  store: LockStore;
  find: FindFn; // an open session of this user/product in Stripe, or null
  isOpen: (sessionId: string) => Promise<boolean>; // still payable (open, not about to expire)
  create: CreateFn<T>;
  params: unknown;
  lockId: string; // fresh per request (crypto.randomUUID())
  claimTtlSeconds?: number;
  sessionTtlSeconds?: number;
  pollDelaysMs?: number[];
  maxRounds?: number;
  sleep?: (ms: number) => Promise<void>;
};

// Returns the URL of the single checkout session for this pending purchase.
export async function obtainCheckoutUrl<T extends { id?: string; url?: string | null }>(deps: ObtainDeps<T>): Promise<string> {
  const {
    store, find, isOpen, create, params, lockId,
    claimTtlSeconds = CLAIM_TTL_SECONDS,
    sessionTtlSeconds = SESSION_TTL_SECONDS,
    pollDelaysMs = POLL_DELAYS_MS,
    maxRounds = MAX_ROUNDS,
    sleep = defaultSleep,
  } = deps;

  let staleLockId: string | null = null;
  for (let round = 0; round < maxRounds; round++) {
    const claim = await store.claim(lockId, claimTtlSeconds, staleLockId);
    staleLockId = null;

    if (claim.won) return await createAsOwner();

    if (claim.sessionId && claim.sessionUrl) {
      if (await isOpen(claim.sessionId)) return claim.sessionUrl;
      // Paid or expired: that session no longer represents a pending purchase. Take the lock over.
      staleLockId = claim.lockId;
      continue;
    }

    // The winner is still creating. Wait for it to publish the session on the lock.
    const polled = await poll(claim.lockId);
    if (polled) return polled;
    // Lock vanished (winner failed and released it) or changed hands: claim again.
  }

  // The winner never finished within our budget. Stripe may still have the session.
  const reusable = await find();
  if (reusable) return reusable.url;
  throw new CheckoutBusyError();

  async function createAsOwner(): Promise<string> {
    let session: Session;
    try {
      session = (await find()) ??
        await createCheckoutSession(create, params, checkoutIdempotencyKey(lockId), find, { sleep });
    } catch (error) {
      await store.release(lockId).catch(() => {});
      throw error;
    }
    try {
      await store.setSession(lockId, session, sessionTtlSeconds);
    } catch {
      // The session exists in Stripe either way; without it on the lock, the next winner finds it via find().
      await store.release(lockId).catch(() => {});
    }
    return session.url;
  }

  // Returns the URL once the lock holder stores it, or null if the lock disappeared / changed hands / timed out.
  async function poll(holder: string): Promise<string | null> {
    for (const delay of pollDelaysMs) {
      await sleep(delay);
      const row = await store.get();
      if (!row || row.lockId !== holder) return null;
      if (row.sessionUrl) return row.sessionUrl;
    }
    return null;
  }
}

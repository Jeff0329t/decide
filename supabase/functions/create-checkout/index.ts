// Creates a Stripe Checkout session (one-time payment) for DECIDE. PRO.
// The caller is identified only by their Supabase JWT. Secrets live in Edge Function secrets, never in the front end.
// PRO is granted by stripe-webhook, not here.
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CheckoutBusyError, obtainCheckoutUrl, type LockStore, type Session } from './checkout-idempotency.ts';

const PRODUCT_NAME = 'DECIDE. UNLIMITED EDITION（買い切り）';
const PRICE_JPY = 980;
// Marks sessions as a DECIDE. PRO purchase; stripe-webhook grants PRO based on this, not on the amount.
const PRODUCT_KEY = 'decide_pro_lifetime';

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://decisionprocess.net').replace(/\/$/, '');
const ALLOWED_ORIGINS = new Set(
  [SITE_URL, ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',')].map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
);
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsFor = (req: Request) => {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : SITE_URL,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'login required' }, 401);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return json({ error: 'login required' }, 401);

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('plan_type').eq('id', user.id).maybeSingle();
  if (profileError) return json({ error: 'profile lookup failed' }, 500);
  if (profile?.plan_type === 'lifetime') return json({ error: 'already pro' }, 409);

  // Return to the origin the purchase started from (localhost in dev), otherwise SITE_URL.
  const origin = req.headers.get('Origin')?.replace(/\/$/, '') ?? '';
  const base = ALLOWED_ORIGINS.has(origin) ? origin : SITE_URL;
  const metadata = { user_id: user.id, product: PRODUCT_KEY };

  // Everything Stripe sees is in this object; it must stay free of per-request values (timestamps, random ids)
  // so that a retry with the same idempotency key sends an identical body.
  const params = {
    mode: 'payment' as const,
    // Card only (Apple Pay / Google Pay included) so PRO is granted instantly; no delayed methods like konbini.
    payment_method_types: ['card' as const],
    locale: 'ja' as const,
    line_items: [{
      quantity: 1,
      price_data: { currency: 'jpy', unit_amount: PRICE_JPY, product_data: { name: PRODUCT_NAME } },
    }],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancel`,
  };

  // Only one request per (user, product) may create a session: the right is claimed atomically in
  // public.checkout_locks (see checkout-idempotency.ts). Double taps / two tabs get the same session.
  const lockId = crypto.randomUUID();
  try {
    const url = await obtainCheckoutUrl({
      store: lockStore(user.id),
      // Reuse a session that is still open instead of creating a second one.
      find: async () => await findOpenSession(user.id, base),
      isOpen: isSessionOpen,
      create: (p, options) => stripe.checkout.sessions.create(p as Stripe.Checkout.SessionCreateParams, options),
      params,
      lockId,
    });
    return json({ url });
  } catch (checkoutError) {
    if (checkoutError instanceof CheckoutBusyError) {
      // 503 (not 409): the front end maps 409 to "already purchased".
      return new Response(JSON.stringify({ error: 'checkout in progress, retry' }), {
        status: 503,
        headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '2' },
      });
    }
    console.error('checkout create failed', (checkoutError as Error).message);
    return json({ error: 'checkout failed' }, 502);
  }
});

// An open session of this user for this product, returning to the same site, that will not expire in the next minute.
// Best effort: if Stripe cannot be listed, the caller (the lock owner) just creates a new session.
async function findOpenSession(userId: string, base: string): Promise<Session | null> {
  const now = Math.floor(Date.now() / 1000);
  try {
    const sessions = await stripe.checkout.sessions.list({ status: 'open', created: { gte: now - 86400 }, limit: 100 });
    const found = sessions.data.find((s) =>
      s.metadata?.user_id === userId &&
      s.metadata?.product === PRODUCT_KEY &&
      (s.success_url ?? '').startsWith(`${base}/`) &&
      s.expires_at > now + 60 &&
      s.url
    );
    return found?.url ? { id: found.id, url: found.url } : null;
  } catch (error) {
    console.warn('open session lookup failed', (error as Error).message);
    return null;
  }
}

// Whether a session recorded on the lock can still be paid. Errors propagate (the request fails with 502)
// rather than guessing and possibly creating a duplicate.
async function isSessionOpen(sessionId: string): Promise<boolean> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return session.status === 'open' && session.expires_at > Math.floor(Date.now() / 1000) + 60;
}

// public.checkout_locks accessed through security-definer RPCs (service_role only).
function lockStore(userId: string): LockStore {
  const must = <T>(result: { data: T; error: { message: string } | null }, what: string): T => {
    if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
    return result.data;
  };
  return {
    async claim(lockId, ttlSeconds, staleLockId) {
      const rows = must(await admin.rpc('claim_checkout_lock', {
        p_user: userId, p_product: PRODUCT_KEY, p_lock: lockId, p_ttl_seconds: ttlSeconds, p_stale_lock: staleLockId,
      }), 'claim_checkout_lock') as Array<{ won: boolean; lock_id: string; session_id: string | null; session_url: string | null }> | null;
      const row = rows?.[0];
      // The row can vanish between the failed insert and the select (released by its owner): just claim again.
      if (!row) return { won: false, lockId: '', sessionId: null, sessionUrl: null };
      return { won: row.won, lockId: row.lock_id, sessionId: row.session_id, sessionUrl: row.session_url };
    },
    async get() {
      const row = must(await admin.from('checkout_locks').select('lock_id, session_id, session_url')
        .eq('user_id', userId).eq('product', PRODUCT_KEY).maybeSingle(), 'checkout_locks select') as
        { lock_id: string; session_id: string | null; session_url: string | null } | null;
      return row ? { lockId: row.lock_id, sessionId: row.session_id, sessionUrl: row.session_url } : null;
    },
    async setSession(lockId, session, ttlSeconds) {
      return must(await admin.rpc('complete_checkout_lock', {
        p_user: userId, p_product: PRODUCT_KEY, p_lock: lockId,
        p_session_id: session.id, p_session_url: session.url, p_ttl_seconds: ttlSeconds,
      }), 'complete_checkout_lock') as boolean;
    },
    async release(lockId) {
      must(await admin.rpc('release_checkout_lock', { p_user: userId, p_product: PRODUCT_KEY, p_lock: lockId }), 'release_checkout_lock');
    },
  };
}

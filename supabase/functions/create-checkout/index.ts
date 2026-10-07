// Creates a Stripe Checkout session (one-time payment) for DECIDE. PRO.
// The caller is identified only by their Supabase JWT. Secrets live in Edge Function secrets, never in the front end.
// PRO is granted by stripe-webhook, not here.
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRODUCT_NAME = 'DECIDE. PRO（リリース記念・永久利用プラン）';
const PRICE_JPY = 980;

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
  const metadata = { user_id: user.id };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'ja',
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
    });
    return json({ url: session.url });
  } catch (stripeError) {
    console.error('checkout create failed', (stripeError as Error).message);
    return json({ error: 'checkout failed' }, 502);
  }
});

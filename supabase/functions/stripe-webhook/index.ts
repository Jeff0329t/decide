// Stripe webhook: the only place that grants or revokes PRO.
// Deploy with --no-verify-jwt; authenticity comes from the Stripe signature instead.
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRICE_JPY = 980;

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return new Response('missing signature', { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (error) {
    return new Response(`invalid signature: ${(error as Error).message}`, { status: 400 });
  }

  // Idempotency: Stripe may deliver the same event more than once.
  const { error: seenError } = await admin.from('stripe_events').insert({ id: event.id, type: event.type });
  if (seenError) {
    if (seenError.code === '23505') return new Response('already processed', { status: 200 });
    return new Response('db error', { status: 500 });
  }

  try {
    if (event.type === 'checkout.session.completed') await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    else if (event.type === 'charge.refunded') await onChargeRefunded(event.data.object as Stripe.Charge);
  } catch (error) {
    // Let Stripe retry: forget the event so the retry is not skipped as a duplicate.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return new Response(`handler error: ${(error as Error).message}`, { status: 500 });
  }
  return new Response('ok', { status: 200 });
});

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return;
  const userId = session.client_reference_id ?? session.metadata?.user_id;
  if (!userId) throw new Error('user id missing on checkout session');
  if (session.currency !== 'jpy' || session.amount_total !== PRICE_JPY) {
    throw new Error(`unexpected amount ${session.amount_total} ${session.currency}`);
  }
  const { data, error } = await admin.from('profiles')
    .update({ plan_type: 'lifetime', pro_since: new Date().toISOString() })
    .eq('id', userId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error(`profile not found for ${userId}`);
}

async function onChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded || charge.amount_refunded < charge.amount) return; // partial refund: keep access
  let userId = charge.metadata?.user_id;
  if (!userId) {
    // Fallback: look the user up from the Checkout session that created this payment.
    const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!paymentIntent) return;
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 });
    userId = sessions.data[0]?.client_reference_id ?? sessions.data[0]?.metadata?.user_id ?? undefined;
  }
  if (!userId) return; // not a DECIDE purchase
  const { error } = await admin.from('profiles').update({ plan_type: 'free', pro_since: null }).eq('id', userId);
  if (error) throw error;
}

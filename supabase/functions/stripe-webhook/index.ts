// Stripe webhook: the only place that grants or revokes PRO.
// Deploy with --no-verify-jwt; authenticity comes from the Stripe signature instead.
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Must match PRODUCT_KEY in create-checkout. Sessions created before the key existed have no `product` metadata.
const PRODUCT_KEY = 'decide_pro_lifetime';
const EXPECTED_JPY = 980; // only used to flag unusual amounts in the logs, never to reject a paid purchase

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
// Optional Slack-compatible incoming webhook for operator alerts (disputes). Unset = logs only.
const ALERT_WEBHOOK_URL = Deno.env.get('ALERT_WEBHOOK_URL');
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
    // Delayed methods (e.g. konbini) complete as 'unpaid' and send async_payment_succeeded once the money arrives.
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === 'charge.refunded') {
      await onChargeRefunded(event.data.object as Stripe.Charge);
    } else if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
      await onDispute(event.data.object as Stripe.Dispute, event.type);
    }
  } catch (error) {
    // Let Stripe retry: forget the event so the retry is not skipped as a duplicate.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return new Response(`handler error: ${(error as Error).message}`, { status: 500 });
  }
  return new Response('ok', { status: 200 });
});

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return;
  // Anything that a retry cannot fix is logged and acknowledged (200), so Stripe does not keep resending it.
  const product = session.metadata?.product;
  if (product && product !== PRODUCT_KEY) {
    console.warn('checkout ignored: not a DECIDE PRO session', session.id, product);
    return;
  }
  const userId = session.client_reference_id ?? session.metadata?.user_id;
  if (!userId) {
    console.error('checkout ignored: user id missing', session.id);
    return;
  }
  if (session.currency !== 'jpy' || session.amount_total !== EXPECTED_JPY) {
    // Coupons, tax settings or a future price change: the customer paid, so grant PRO and leave a trace.
    console.warn('checkout amount differs from expected', session.id, session.amount_total, session.currency);
  }
  const { data, error } = await admin.from('profiles')
    .update({ plan_type: 'lifetime', pro_since: new Date().toISOString() })
    .eq('id', userId).select('id');
  if (error) throw error;
  if (!data?.length) console.error('checkout ignored: profile not found', session.id, userId); // e.g. account deleted
}

async function onChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded || charge.amount_refunded < charge.amount) return; // partial refund: keep access
  const userId = await findUserId(charge.metadata?.user_id, charge.payment_intent);
  if (!userId) return; // not a DECIDE purchase
  const { error } = await admin.from('profiles').update({ plan_type: 'free', pro_since: null }).eq('id', userId);
  if (error) throw error;
}

// Chargebacks are recorded and reported only. Whether to revoke PRO is an operator decision (see docs/setup-stripe.md).
async function onDispute(dispute: Stripe.Dispute, type: string) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  const paymentIntent = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
  const userId = await findUserId(undefined, paymentIntent);
  const { error } = await admin.from('stripe_disputes').upsert({
    id: dispute.id,
    charge_id: chargeId,
    payment_intent_id: paymentIntent,
    user_id: userId ?? null,
    amount: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    updated_at: new Date().toISOString(),
  }, { ignoreDuplicates: type === 'charge.dispute.created' }); // a late "created" must not overwrite a "closed" result
  if (error) throw error;

  const label = type === 'charge.dispute.created' ? 'チャージバック発生' : `チャージバック終了（${dispute.status}）`;
  const text = `[DECIDE] ${label}: ${dispute.id} / ${dispute.amount} ${dispute.currency.toUpperCase()} / reason=${dispute.reason} / user=${userId ?? '不明'}`;
  console.error(text);
  await notify(text);
}

// Resolve the DECIDE user behind a payment: charge metadata first, then the Checkout session that created it.
async function findUserId(metadataUserId: string | undefined, paymentIntent: string | Stripe.PaymentIntent | null): Promise<string | undefined> {
  if (metadataUserId) return metadataUserId;
  const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
  if (!paymentIntentId) return undefined;
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  return sessions.data[0]?.client_reference_id ?? sessions.data[0]?.metadata?.user_id ?? undefined;
}

// Best effort: the dispute is already recorded, so a failed alert must not make Stripe redeliver the event.
async function notify(text: string) {
  if (!ALERT_WEBHOOK_URL) return;
  try {
    const res = await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.error('alert failed', res.status);
  } catch (error) {
    console.error('alert failed', (error as Error).message);
  }
}

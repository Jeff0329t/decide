// DECIDE: send-reminders
// Called by pg_cron (see supabase/push-cron.example.sql) every 15 minutes.
// Sends one fixed-text Web Push per user who has due, unsent reminders, then marks them sent.
// Only {log_id, remind_at} is stored on the server; the log contents never leave the device.
// Deploy with: supabase functions deploy send-reminders --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const PAYLOAD = JSON.stringify({
  title: 'あの決断、どうなった？',
  body: 'ふり返りの時間です。アプリを開いて、その後を記録しましょう。',
  tag: 'decide-remind'
});

Deno.serve(async req => {
  const secret = Deno.env.get('CRON_SECRET') || '';
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return json({ error: 'vapid not configured' }, 500);
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: due, error: dueError } = await admin
    .from('push_reminders')
    .select('user_id, log_id')
    .is('sent_at', null)
    .lte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true })
    .limit(1000);
  if (dueError) return json({ error: 'select failed' }, 500);
  if (!due?.length) return json({ users: 0, sent: 0 });

  const byUser = new Map<string, string[]>();
  for (const row of due) {
    const list = byUser.get(row.user_id) || [];
    list.push(row.log_id);
    byUser.set(row.user_id, list);
  }

  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', [...byUser.keys()]);
  if (subsError) return json({ error: 'select failed' }, 500);

  let sent = 0;
  const gone: string[] = [];
  for (const [userId, logIds] of byUser) {
    const targets = (subs || []).filter(s => s.user_id === userId);
    for (const s of targets) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, PAYLOAD, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
      }
    }
    // Mark sent even if the user has no subscription, so we do not retry forever.
    await admin
      .from('push_reminders')
      .update({ sent_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('log_id', logIds)
      .is('sent_at', null);
  }

  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);

  return json({ users: byUser.size, sent, removed: gone.length });
});

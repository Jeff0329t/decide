// DECIDE: send-reminders
// Called by pg_cron (see supabase/push-cron.example.sql) every 15 minutes.
// Sends one fixed-text Web Push per device (endpoint) that has due, unsent reminders, then marks them sent.
// If every send fails temporarily, the reminders stay unsent and are retried next run (up to GIVE_UP_MS).
// Only {endpoint, log_id, remind_at} is stored on the server; the log contents never leave the device.
// Deploy with: supabase functions deploy send-reminders --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// 一時的な失敗はこの期間まで再送を試み、それを過ぎたら諦めて送信済みにする
const GIVE_UP_MS = 3 * 24 * 60 * 60 * 1000;

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
    .select('user_id, endpoint, log_id, remind_at')
    .is('sent_at', null)
    .lte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true })
    .limit(1000);
  if (dueError) return json({ error: 'select failed' }, 500);
  if (!due?.length) return json({ users: 0, sent: 0 });

  // 予定は端末（endpoint）ごと。その端末にだけ送る
  const byDevice = new Map<string, { user_id: string; endpoint: string; log_id: string; remind_at: string }[]>();
  for (const row of due) {
    const list = byDevice.get(row.endpoint) || [];
    list.push(row);
    byDevice.set(row.endpoint, list);
  }

  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('endpoint', [...byDevice.keys()]);
  if (subsError) return json({ error: 'select failed' }, 500);

  let sent = 0;
  let failed = 0;
  let pending = 0;
  let updateErrors = 0;
  const gone: string[] = [];
  const users = new Set<string>();
  const now = Date.now();
  for (const [endpoint, allRows] of byDevice) {
    const s = (subs || []).find(x => x.endpoint === endpoint);
    // 宛先の持ち主と違う人の予定は送らない（付けかえ時に消える）
    const rows = allRows.filter(r => !s || r.user_id === s.user_id);
    if (!rows.length) continue;
    const userId = rows[0].user_id;
    users.add(userId);
    let ok = false;
    let live = false; // 届かなかったが、まだ有効な購読（一時的な失敗）
    if (s) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, PAYLOAD, { TTL: 60 * 60 * 24 });
        sent++;
        ok = true;
      } catch (error) {
        failed++;
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else live = true;
      }
    }
    // 届いた／届け先が無い（購読なし・失効）なら送信済み。
    // 一時的な失敗だけなら次回に再送し、GIVE_UP_MS を過ぎたものだけ諦める。
    const finished = ok || !live;
    const logIds = finished
      ? rows.map(r => r.log_id)
      : rows.filter(r => now - new Date(r.remind_at).getTime() > GIVE_UP_MS).map(r => r.log_id);
    pending += rows.length - logIds.length;
    if (!logIds.length) continue;
    const { error: updateError } = await admin
      .from('push_reminders')
      .update({ sent_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .in('log_id', logIds)
      .is('sent_at', null);
    if (updateError) updateErrors++;
  }

  let removed = 0;
  if (gone.length) {
    const { error: deleteError } = await admin.from('push_subscriptions').delete().in('id', gone);
    if (!deleteError) removed = gone.length;
  }

  if (updateErrors) return json({ error: 'update failed', users: users.size, sent, failed, pending, removed }, 500);
  return json({ users: users.size, sent, failed, pending, removed });
});

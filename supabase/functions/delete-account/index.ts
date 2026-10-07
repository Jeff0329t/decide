// Deletes the caller's own account (auth.users row; profiles row cascades).
// The caller is identified only by their Supabase JWT. The service role key lives in Edge Function secrets, never in the front end.
// Decision logs are stored only on the user's device and are not touched here.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://decisionprocess.net').replace(/\/$/, '');
const ALLOWED_ORIGINS = new Set(
  [SITE_URL, ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',')].map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
);
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

  // profiles is removed by ON DELETE CASCADE; delete explicitly too in case the FK was altered.
  const { error: profileError } = await admin.from('profiles').delete().eq('id', user.id);
  if (profileError) return json({ error: 'profile delete failed' }, 500);
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: 'account delete failed' }, 500);
  return json({ ok: true });
});

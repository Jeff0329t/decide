import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from './handler.mjs';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
Deno.serve(createHandler({ admin, config: {
  enabled: Deno.env.get('EMAIL_DELIVERY_ENABLED'),
  secret: Deno.env.get('GAS_WORKER_SECRET'),
  sender: Deno.env.get('GAS_SENDER_EMAIL'),
  site: Deno.env.get('SITE_URL')
} }));

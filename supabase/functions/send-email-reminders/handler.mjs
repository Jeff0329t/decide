// Private bridge for the Apps Script worker. No Gmail or DB secret reaches the app.
export function createHandler({ admin, config }) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  return async req => {
    if(req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if(!config.secret || req.headers.get('x-worker-secret') !== config.secret) return json({ error: 'unauthorized' }, 401);
    let input;
    try { input = await req.json(); } catch { return json({ error: 'invalid request' }, 400); }
    if(!input || typeof input !== 'object' || input.sender !== config.sender || !/^[^\s<>@]+@gmail\.com$/i.test(config.sender || '') || !/^https:\/\/[^\s]+$/.test(config.site || '')) {
      return json({ error: 'worker not configured' }, 403);
    }
    if(input.action === 'status') return json({ ok: true, enabled: config.enabled === 'true' });
    // Completion remains available during a stop, for mail already dispatched.
    if(input.action !== 'complete' && config.enabled !== 'true') return json({ error: 'mail delivery disabled' }, 503);
    try {
      if(input.action === 'claim') {
        const { data, error } = await admin.rpc('claim_email_reminders', { sender: config.sender, site_url: config.site });
        if(error) return json({ error: 'claim failed' }, 500);
        return json({ jobs: (data || []).map(job => ({ id: job.id, lease: job.lease_token })) });
      }
      if(!uuid(input.id) || !uuid(input.lease)) return json({ error: 'invalid delivery' }, 400);
      if(input.action === 'reserve') {
        const { data, error } = await admin.rpc('reserve_email_reminder', { delivery: input.id, lease: input.lease });
        if(error) return json({ error: 'reservation failed' }, 500);
        return json({ payload: data || null });
      }
      if(input.action === 'complete' && typeof input.accepted === 'boolean') {
        const { data, error } = await admin.rpc('complete_email_reminder', { delivery: input.id, lease: input.lease, accepted: input.accepted });
        if(error) return json({ error: 'completion failed' }, 500);
        return json({ ok: data === true }, data === true ? 200 : 409);
      }
      return json({ error: 'invalid action' }, 400);
    } catch { return json({ error: 'worker request failed' }, 500); }
  };
}

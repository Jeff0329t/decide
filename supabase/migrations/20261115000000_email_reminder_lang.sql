-- English reminder emails: remember each device's UI language and build the digest text in it.
-- Japanese stays the default everywhere; the original Japanese payload expressions are NOT
-- modified. The 5-argument email_reminder_digest_payload_ keeps its exact current definition,
-- and the new 6-argument overload delegates to it for every language except 'en', so Japanese
-- payloads remain byte-identical. Apply this migration BEFORE publishing the app change that
-- starts sending `lang` (the 4-argument RPC does not exist until this runs).

alter table public.email_reminder_devices
  add column lang text not null default 'ja' check (lang in ('ja', 'en')),
  add column updated_at timestamptz not null default now();

-- The language of an account's reminder mail: the lang of its enabled device that synced
-- most recently. Falls back to 'ja' when nothing is enrolled.
create function public.email_reminder_user_lang_(uid uuid) returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select d.lang from public.email_reminder_devices d
    where d.user_id = uid and d.enabled
    order by d.updated_at desc, d.device_id
    limit 1), 'ja');
$$;

-- 4-argument version of set_email_reminders. The 3-argument version stays untouched, so the
-- old app keeps working against the new schema. A null lang keeps the stored value; a real
-- value replaces it and advances updated_at (that timestamp arbitrates between devices).
create function public.set_email_reminders(device uuid, enabled boolean, items jsonb, lang text) returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_lang text := lang;
  item jsonb;
  ids text[] := '{}';
  log text;
  at timestamptz;
  reminder_title text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if device is null or enabled is null then raise exception 'invalid setting' using errcode = '22023'; end if;
  if new_lang is not null and new_lang not in ('ja', 'en') then raise exception 'invalid lang' using errcode = '22023'; end if;
  -- Only an authenticated, verified address may be enrolled. OFF always remains available.
  if enabled and not exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null and u.email <> '') then
    raise exception 'verified email required' using errcode = '22023';
  end if;
  if items is null or jsonb_typeof(items) <> 'array' then raise exception 'invalid items' using errcode = '22023'; end if;
  if jsonb_array_length(items) > 500 then raise exception 'too many items' using errcode = '22023'; end if;
  insert into public.email_reminder_devices (user_id, device_id, enabled, lang, updated_at)
    values (uid, device, enabled, coalesce(new_lang, 'ja'), now())
    on conflict (user_id, device_id) do update
      set enabled = excluded.enabled,
          lang = case when new_lang is not null then excluded.lang else public.email_reminder_devices.lang end,
          updated_at = case when new_lang is not null then now() else public.email_reminder_devices.updated_at end;
  if not enabled then
    delete from public.email_reminders r where r.user_id = uid and r.device_id = device;
    return;
  end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'remindAt') is distinct from 'string' then
      raise exception 'invalid item' using errcode = '22023';
    end if;
    if item ? 'title' and (jsonb_typeof(item->'title') is distinct from 'string' or length(item->>'title') > 60) then
      raise exception 'invalid title' using errcode = '22023';
    end if;
    reminder_title := btrim(regexp_replace(coalesce(item->>'title', ''), E'[\r\n\t]+', ' ', 'g'));
    log := item->>'id';
    if length(log) not between 1 and 100 or log = any(ids) then raise exception 'invalid id' using errcode = '22023'; end if;
    at := (item->>'remindAt')::timestamptz;
    if not isfinite(at) then raise exception 'invalid date' using errcode = '22023'; end if;
    -- registered_at is deliberately NOT updated on conflict: the first registration day stands.
    insert into public.email_reminders (user_id, device_id, log_id, remind_at, title)
      values (uid, device, log, at, reminder_title)
      on conflict (user_id, device_id, log_id) do update set remind_at = excluded.remind_at, title = excluded.title;
    ids := array_append(ids, log);
  end loop;
  delete from public.email_reminders r where r.user_id = uid and r.device_id = device and not (r.log_id = any(ids));
end;
$$;

-- English branch of the digest payload builder. Anything but 'en' delegates to the original
-- 5-argument function, whose Japanese expressions are unchanged. Decision titles are the
-- user's own records and are never translated; only the surrounding text is English.
create function public.email_reminder_digest_payload_(sender text, site_url text, user_email text, token uuid, items jsonb, lang text)
returns jsonb
language plpgsql immutable
as $$
declare
  n int := jsonb_array_length(items);
  first_title text := coalesce(items->0->>'title', '');
  t text := case when first_title <> '' then first_title else 'a recorded decision' end;
  subject text;
  body text;
begin
  if lang is distinct from 'en' then
    return public.email_reminder_digest_payload_(sender, site_url, user_email, token, items);
  end if;
  if n >= 2 then
    subject := 'DECIDE. | You have ' || n || ' decisions to look back on today';
    body := 'Another day done.' || E'\n' ||
      'The day has come to look back on ' || n || ' decisions.' || E'\n\n' ||
      (select string_agg('• "' || case when coalesce(it->>'title', '') <> '' then it->>'title' else 'a recorded decision' end || '"', E'\n' order by ord)
         from jsonb_array_elements(items) with ordinality as e(it, ord)) || E'\n\n' ||
      'How did it go? Whether it went well or differently than you expected, a few words are enough.' || E'\n' ||
      'If there''s one you haven''t acted on yet, "not yet" is also a record of where you are now.' || E'\n' ||
      'You don''t have to do all of them — start with just one that catches your eye.' || E'\n\n';
    if exists (select 1 from jsonb_array_elements(items) it where (it->>'long')::boolean) then
      body := body || 'For a decision you planned to take time with, you can record how it feels partway through, even before the outcome is clear.' || E'\n\n';
    end if;
    if exists (select 1 from jsonb_array_elements(items) it where (it->>'repeat')::boolean) then
      body := body || 'This includes a decision we reminded you about once before. Start with whichever you like.' || E'\n\n';
    end if;
    body := body || 'Open DECIDE. and add "how it went" from your history:' || E'\n' || site_url;
  elsif (items->0->>'repeat')::boolean then
    subject := 'DECIDE. | A look-back is still waiting for "' || t || '"';
    body := '"' || t || '" is a decision we reminded you about once before. You chose a new day to look back on it, and today is that day.' || E'\n\n' ||
      'Whenever you feel like it is fine. Even a few words — record how it feels now.' || E'\n' ||
      'And it''s fine if you''re not there yet. "Not yet" is also a record of where you are now.' || E'\n\n' ||
      'If you no longer need reminders about this decision, add a look-back from the app''s history, or remove the day.' || E'\n\n' ||
      'Open DECIDE. and add "how it went" for this record from your history:' || E'\n' || site_url;
  elsif (items->0->>'long')::boolean then
    subject := 'DECIDE. | "' || t || '" — how has it gone since then?';
    body := 'You set "' || t || '" to look back on a little further ahead.' || E'\n\n' ||
      'With time having passed, has anything changed — in your situation, or in how you feel?' || E'\n' ||
      'Even if there''s no outcome yet, how it feels partway through is also a record.' || E'\n' ||
      'Even a few words, compared with how you felt when you decided.' || E'\n\n' ||
      'Recording how it feels now gives you your own experience to draw on the next time you face a similar choice.' || E'\n\n' ||
      'Open DECIDE. and add "how it went" for this record from your history:' || E'\n' || site_url;
  else
    subject := 'DECIDE. | ' || case when first_title <> '' then 'Look back on "' || first_title || '"?' else 'Look back on a decision you recorded?' end;
    body := case when first_title <> '' then 'You set today as the day to look back on "' || first_title || '".' else 'You set today as the day to look back on a decision you recorded.' end || E'\n\n' ||
      'How did it go? Has how you feel changed since you decided?' || E'\n' ||
      'Whether it went well or differently than you expected, a few words are enough.' || E'\n' ||
      'If you haven''t acted on it yet, "not yet" is also a record of where you are now.' || E'\n\n' ||
      'Recording how it feels now gives you your own experience to draw on the next time you face a similar choice.' || E'\n\n' ||
      'Open DECIDE. and add "how it went" for this record from your history:' || E'\n' || site_url;
  end if;
  body := body || E'\n\n' ||
    'You''re receiving this email because you turned on "Email reminders" in DECIDE.' || E'\n' ||
    'Stop reminder emails (all devices):' || E'\n' || site_url || '/unsubscribe?t=' || token::text || E'\n' ||
    'You can also stop them from the "Email reminders" setting in the app.';
  return jsonb_build_object('from', sender, 'to', jsonb_build_array(user_email),
    'subject', subject, 'text', body, 'site', site_url);
end;
$$;

-- Same claim as the digest migration, except the payload is built in the account's language.
create or replace function public.claim_email_reminders(sender text, site_url text)
returns setof public.email_reminder_deliveries
language plpgsql security definer set search_path = public
as $$
declare
  grp record;
  did uuid;
  items_json jsonb;
begin
  insert into public.email_unsubscribe_tokens (user_id)
  select distinct r.user_id from public.email_reminders r
  where r.remind_at <= now() and r.remind_at > now() - interval '7 days'
  on conflict (user_id) do nothing;

  -- Bundle every due schedule into one digest per account and evening. A schedule already
  -- mailed (legacy row or digest member) is never bundled again, whichever form came first.
  for grp in
    select r.user_id as uid, public.email_reminder_digest_at_(r.remind_at) as dat
    from public.email_reminders r
    join public.email_reminder_devices d on d.user_id = r.user_id and d.device_id = r.device_id
    join auth.users u on u.id = r.user_id
    where d.enabled and u.email_confirmed_at is not null and u.email <> ''
      and r.remind_at > now() - interval '7 days'
      and public.email_reminder_digest_at_(r.remind_at) <= now()
      and not exists (select 1 from public.email_reminder_deliveries j
        where j.user_id = r.user_id and j.log_id = r.log_id and j.remind_at = r.remind_at)
      and not exists (select 1 from public.email_reminder_delivery_items i
        where i.user_id = r.user_id and i.log_id = r.log_id and i.remind_at = r.remind_at)
    group by r.user_id, public.email_reminder_digest_at_(r.remind_at)
  loop
    select j.id into did from public.email_reminder_deliveries j
      where j.user_id = grp.uid and j.digest_at = grp.dat;
    if did is not null and exists (select 1 from public.email_reminder_deliveries j
        where j.id = did and (j.sent_at is not null or j.failed_at is not null or j.dispatch_started_at is not null)) then
      -- That evening's digest is already sent (or its send is ambiguous): never mail it twice.
      continue;
    end if;
    if did is null then
      insert into public.email_reminder_deliveries (user_id, log_id, remind_at, digest_at, payload)
        values (grp.uid, '', grp.dat, grp.dat, '{}'::jsonb)
        on conflict (user_id, digest_at) where digest_at is not null do nothing
        returning id into did;
      if did is null then continue; end if; -- a concurrent claim created it; the next claim tops it up
    end if;

    insert into public.email_reminder_delivery_items (delivery_id, user_id, log_id, remind_at, title)
    select did, r.user_id, r.log_id, r.remind_at, max(r.title)
    from public.email_reminders r
    join public.email_reminder_devices d on d.user_id = r.user_id and d.device_id = r.device_id
    where d.enabled and r.user_id = grp.uid
      and r.remind_at > now() - interval '7 days'
      and public.email_reminder_digest_at_(r.remind_at) = grp.dat
      and not exists (select 1 from public.email_reminder_deliveries j
        where j.user_id = r.user_id and j.log_id = r.log_id and j.remind_at = r.remind_at)
      and not exists (select 1 from public.email_reminder_delivery_items i
        where i.user_id = r.user_id and i.log_id = r.log_id and i.remind_at = r.remind_at)
    group by r.user_id, r.log_id, r.remind_at
    on conflict (user_id, log_id, remind_at) do nothing;

    -- The text is regenerated while the digest is still unsent, so schedules that join the
    -- same evening later are part of the one email. reserve rebuilds it once more, finally.
    items_json := public.email_reminder_digest_items_(did);
    update public.email_reminder_deliveries j
      set payload = public.email_reminder_digest_payload_(sender, site_url, eu.email, tk.token, items_json, public.email_reminder_user_lang_(grp.uid))
      from auth.users eu, public.email_unsubscribe_tokens tk
      where j.id = did and eu.id = grp.uid and tk.user_id = grp.uid
        and j.sent_at is null and j.dispatch_started_at is null;
  end loop;

  -- Keep the small deduplication record; erase the address/payload after 30 days.
  update public.email_reminder_deliveries j set payload = '{}'
    where j.first_attempt_at < now() - interval '30 days' and j.payload <> '{}';

  return query
  with candidates as (
    select j.id from public.email_reminder_deliveries j
    join auth.users u on u.id = j.user_id
    where j.sent_at is null and j.failed_at is null and j.dispatch_started_at is null
      and (j.lease_until is null or j.lease_until < now())
      and u.email_confirmed_at is not null and j.payload->'to'->>0 = u.email
      and (
        (j.digest_at is not null and j.digest_at <= now() and j.digest_at > now() - interval '7 days'
          and exists (select 1 from public.email_reminder_delivery_items i
            join public.email_reminders r on r.user_id = i.user_id and r.log_id = i.log_id and r.remind_at = i.remind_at
            join public.email_reminder_devices d on d.user_id = r.user_id and d.device_id = r.device_id
            where i.delivery_id = j.id and d.enabled))
        or
        (j.digest_at is null and j.remind_at > now() - interval '7 days'
          and exists (select 1 from public.email_reminders r join public.email_reminder_devices d using (user_id, device_id)
            where d.enabled and r.user_id = j.user_id and r.log_id = j.log_id and r.remind_at = j.remind_at))
      )
    order by coalesce(j.digest_at, j.remind_at) limit 20 for update of j skip locked
  )
  update public.email_reminder_deliveries j
    set first_attempt_at = coalesce(j.first_attempt_at, now()),
        lease_until = now() + interval '5 minutes', lease_token = gen_random_uuid()
    from candidates c where j.id = c.id returning j.*;
end;
$$;

-- Same reserve as the digest migration, except the rebuilt text uses the account's language.
create or replace function public.reserve_email_reminder(delivery uuid, lease uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  j public.email_reminder_deliveries;
  items_json jsonb;
  rebuilt jsonb;
begin
  select * into j from public.email_reminder_deliveries d where d.id = delivery and d.lease_token = lease for update;
  if not found or j.dispatch_started_at is not null or j.sent_at is not null or j.failed_at is not null
     or j.lease_until is null or j.lease_until <= now() then
    return null;
  end if;
  if j.digest_at is null then
    -- Legacy single-reminder delivery: unchanged behavior.
    if not public.email_reminder_is_active(delivery, lease) then return null; end if;
    update public.email_reminder_deliveries d set dispatch_started_at = now() where d.id = delivery;
    return j.payload;
  end if;
  if not exists (select 1 from auth.users u where u.id = j.user_id
      and u.email_confirmed_at is not null and u.email <> '' and j.payload->'to'->>0 = u.email) then
    return null;
  end if;
  delete from public.email_reminder_delivery_items i
    where i.delivery_id = delivery
      and not exists (select 1 from public.email_reminders r
        join public.email_reminder_devices d on d.user_id = r.user_id and d.device_id = r.device_id
        where d.enabled and r.user_id = i.user_id and r.log_id = i.log_id and r.remind_at = i.remind_at);
  if not exists (select 1 from public.email_reminder_delivery_items i where i.delivery_id = delivery) then
    -- Every member was cancelled after the claim: close the digest unsent so it is never leased again.
    update public.email_reminder_deliveries d set failed_at = now(), lease_until = null where d.id = delivery;
    return null;
  end if;
  items_json := public.email_reminder_digest_items_(delivery);
  rebuilt := public.email_reminder_digest_payload_(
    j.payload->>'from', j.payload->>'site',
    (select u.email from auth.users u where u.id = j.user_id),
    (select t.token from public.email_unsubscribe_tokens t where t.user_id = j.user_id),
    items_json, public.email_reminder_user_lang_(j.user_id));
  update public.email_reminder_deliveries d set dispatch_started_at = now(), payload = rebuilt where d.id = delivery;
  return rebuilt;
end;
$$;

revoke all on function public.set_email_reminders(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.set_email_reminders(uuid, boolean, jsonb, text) to authenticated;
revoke all on function public.email_reminder_digest_payload_(text, text, text, uuid, jsonb, text), public.email_reminder_user_lang_(uuid) from public, anon, authenticated;
grant execute on function public.email_reminder_digest_payload_(text, text, text, uuid, jsonb, text), public.email_reminder_user_lang_(uuid) to service_role;
revoke all on function public.claim_email_reminders(text, text), public.reserve_email_reminder(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_email_reminders(text, text), public.reserve_email_reminder(uuid, uuid) to service_role;

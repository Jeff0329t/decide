-- Separate opt-in per device. No decision text, cards, memo or review is stored here.
create table public.email_reminder_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  enabled boolean not null default false,
  primary key (user_id, device_id)
);
create table public.email_reminders (
  user_id uuid not null,
  device_id uuid not null,
  log_id text not null check (length(log_id) between 1 and 100),
  remind_at timestamptz not null check (isfinite(remind_at)),
  primary key (user_id, device_id, log_id),
  foreign key (user_id, device_id) references public.email_reminder_devices on delete cascade
);
create index email_reminders_due_idx on public.email_reminders (remind_at);
-- One immutable delivery per account/log/time, even if several devices register it.
create table public.email_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id text not null,
  remind_at timestamptz not null,
  payload jsonb not null,
  first_attempt_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  dispatch_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  unique (user_id, log_id, remind_at)
);
alter table public.email_reminder_devices enable row level security;
alter table public.email_reminders enable row level security;
alter table public.email_reminder_deliveries enable row level security;
revoke all on public.email_reminder_devices, public.email_reminders, public.email_reminder_deliveries from anon, authenticated;
grant all on public.email_reminder_devices, public.email_reminders, public.email_reminder_deliveries to service_role;

create function public.get_email_reminder_setting(device uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select d.enabled from public.email_reminder_devices d
    where d.user_id = auth.uid() and d.device_id = device), false);
$$;

create function public.set_email_reminders(device uuid, enabled boolean, items jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  ids text[] := '{}';
  log text;
  at timestamptz;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if device is null or enabled is null then raise exception 'invalid setting' using errcode = '22023'; end if;
  -- Only an authenticated, verified address may be enrolled. OFF always remains available.
  if enabled and not exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null and u.email <> '') then
    raise exception 'verified email required' using errcode = '22023';
  end if;
  if items is null or jsonb_typeof(items) <> 'array' then raise exception 'invalid items' using errcode = '22023'; end if;
  if jsonb_array_length(items) > 500 then raise exception 'too many items' using errcode = '22023'; end if;
  insert into public.email_reminder_devices (user_id, device_id, enabled)
    values (uid, device, enabled)
    on conflict (user_id, device_id) do update set enabled = excluded.enabled;
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
    log := item->>'id';
    if length(log) not between 1 and 100 or log = any(ids) then raise exception 'invalid id' using errcode = '22023'; end if;
    at := (item->>'remindAt')::timestamptz;
    if not isfinite(at) then raise exception 'invalid date' using errcode = '22023'; end if;
    insert into public.email_reminders (user_id, device_id, log_id, remind_at)
      values (uid, device, log, at)
      on conflict (user_id, device_id, log_id) do update set remind_at = excluded.remind_at;
    ids := array_append(ids, log);
  end loop;
  delete from public.email_reminders r where r.user_id = uid and r.device_id = device and not (r.log_id = any(ids));
end;
$$;

-- A lease handles overlap before dispatch. A separate irreversible reservation
-- prevents ambiguous MailApp sends repeating (MailApp has no idempotency key).
create function public.claim_email_reminders(sender text, site_url text)
returns setof public.email_reminder_deliveries
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.email_reminder_deliveries (user_id, log_id, remind_at, payload)
  select distinct r.user_id, r.log_id, r.remind_at,
    jsonb_build_object('from', sender, 'to', jsonb_build_array(u.email),
      'subject', 'DECIDE.｜あの決断、その後どうですか？',
      'text', 'ふり返りの時間です。' || E'\n\n' || 'DECIDEを開いて、あの決断のその後を残してみませんか？' || E'\n' || site_url || E'\n\n' ||
        'このメールは、DECIDEで「メールでリマインド」をONにした方へお送りしています。' || E'\n' ||
        '停止するには、登録した端末の設定で「メールでリマインド」をOFFにしてください。')
  from public.email_reminders r
  join public.email_reminder_devices d using (user_id, device_id)
  join auth.users u on u.id = r.user_id
  where d.enabled and u.email_confirmed_at is not null and u.email <> ''
    and r.remind_at <= now() and r.remind_at > now() - interval '7 days'
    and not exists (select 1 from public.email_reminder_deliveries j where j.user_id = r.user_id and j.log_id = r.log_id and j.remind_at = r.remind_at)
  order by r.remind_at limit 20
  on conflict (user_id, log_id, remind_at) do nothing;

  -- Keep the small deduplication record; erase the address/payload after 30 days.
  update public.email_reminder_deliveries j set payload = '{}'
    where j.first_attempt_at < now() - interval '30 days' and j.payload <> '{}';

  return query
  with candidates as (
    select j.id from public.email_reminder_deliveries j
    join auth.users u on u.id = j.user_id
    where j.sent_at is null and j.failed_at is null and j.dispatch_started_at is null
      and (j.lease_until is null or j.lease_until < now())
      and j.remind_at > now() - interval '7 days'
      and u.email_confirmed_at is not null and j.payload->'to'->>0 = u.email
      and exists (select 1 from public.email_reminders r join public.email_reminder_devices d using (user_id, device_id)
        where d.enabled and r.user_id = j.user_id and r.log_id = j.log_id and r.remind_at = j.remind_at)
    order by j.remind_at limit 20 for update of j skip locked
  )
  update public.email_reminder_deliveries j
    set first_attempt_at = coalesce(j.first_attempt_at, now()),
        lease_until = now() + interval '5 minutes', lease_token = gen_random_uuid()
    from candidates c where j.id = c.id returning j.*;
end;
$$;

-- Recheck cancellation immediately before the external send.
create function public.email_reminder_is_active(delivery uuid, lease uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.email_reminder_deliveries j join auth.users u on u.id = j.user_id
    where j.id = delivery and j.lease_token = lease and j.lease_until > now()
      and j.sent_at is null and j.failed_at is null and j.dispatch_started_at is null
      and j.remind_at > now() - interval '7 days'
      and u.email_confirmed_at is not null and j.payload->'to'->>0 = u.email
      and exists (select 1 from public.email_reminders r join public.email_reminder_devices d using (user_id, device_id)
        where d.enabled and r.user_id = j.user_id and r.log_id = j.log_id and r.remind_at = j.remind_at));
$$;

-- Reserve BEFORE sending. An interrupted reserved delivery requires manual review.
create function public.reserve_email_reminder(delivery uuid, lease uuid) returns jsonb
language sql security definer set search_path = public
as $$
  update public.email_reminder_deliveries j set dispatch_started_at = now()
  where j.id = delivery and j.lease_token = lease and j.dispatch_started_at is null
    and public.email_reminder_is_active(delivery, lease)
  returning j.payload;
$$;

create function public.complete_email_reminder(delivery uuid, lease uuid, accepted boolean) returns boolean
language plpgsql security definer set search_path = public
as $$
declare j public.email_reminder_deliveries;
begin
  select * into j from public.email_reminder_deliveries d where d.id = delivery and d.lease_token = lease for update;
  if not found or j.dispatch_started_at is null or accepted is null then return false; end if;
  if j.sent_at is not null then return accepted; end if;
  if j.failed_at is not null then return not accepted; end if;
  update public.email_reminder_deliveries d set sent_at = case when accepted then now() else null end,
    failed_at = case when accepted then null else now() end, lease_until = null where d.id = delivery;
  return true;
end;
$$;

revoke all on function public.get_email_reminder_setting(uuid), public.set_email_reminders(uuid, boolean, jsonb) from public, anon;
grant execute on function public.get_email_reminder_setting(uuid), public.set_email_reminders(uuid, boolean, jsonb) to authenticated;
revoke all on function public.claim_email_reminders(text, text), public.email_reminder_is_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_email_reminders(text, text), public.email_reminder_is_active(uuid, uuid) to service_role;
revoke all on function public.reserve_email_reminder(uuid, uuid), public.complete_email_reminder(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reserve_email_reminder(uuid, uuid), public.complete_email_reminder(uuid, uuid, boolean) to service_role;

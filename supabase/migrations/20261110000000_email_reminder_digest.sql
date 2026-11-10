-- Evening digest delivery: reminders whose day has come are bundled into one email per
-- account per evening (19:00 Asia/Tokyo) instead of one email per decision log.
-- The worker and the bridge keep the exact same payload shape ({from, to[1], subject, text}),
-- so only the database changes. Legacy per-log deliveries stay readable and keep blocking
-- duplicates; a digest carries its member reminders in email_reminder_delivery_items.

-- First 19:00 (Asia/Tokyo) at or after the given instant. A reminder is never sent early:
-- a 21:00 due time joins the NEXT evening, a 15:00 due time joins that same evening.
create function public.email_reminder_digest_at_(at timestamptz) returns timestamptz
language sql immutable
as $$
  select case
    when (at at time zone 'Asia/Tokyo')::time <= time '19:00:00'
      then (((at at time zone 'Asia/Tokyo')::date + time '19:00:00') at time zone 'Asia/Tokyo')
    else ((((at at time zone 'Asia/Tokyo')::date + 1) + time '19:00:00') at time zone 'Asia/Tokyo')
  end;
$$;

-- When a schedule was first registered (re-registration of the same log keeps the first day).
-- Used only as a rough signal for how far ahead the person planned the look-back.
alter table public.email_reminders add column registered_at timestamptz not null default now();

create or replace function public.set_email_reminders(device uuid, enabled boolean, items jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  ids text[] := '{}';
  log text;
  at timestamptz;
  reminder_title text;
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

-- A digest delivery has digest_at set and log_id ''. Its member reminders live in the items
-- table, which carries the same "one schedule is mailed at most once" guarantee the
-- deliveries table's unique key gave the legacy per-log rows.
alter table public.email_reminder_deliveries alter column log_id drop not null;
alter table public.email_reminder_deliveries add column digest_at timestamptz;
create unique index email_reminder_deliveries_digest_uniq
  on public.email_reminder_deliveries (user_id, digest_at) where digest_at is not null;

create table public.email_reminder_delivery_items (
  delivery_id uuid not null references public.email_reminder_deliveries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id text not null,
  remind_at timestamptz not null,
  title text not null default '',
  primary key (delivery_id, log_id, remind_at),
  unique (user_id, log_id, remind_at)
);
alter table public.email_reminder_delivery_items enable row level security;
revoke all on public.email_reminder_delivery_items from anon, authenticated;
grant all on public.email_reminder_delivery_items to service_role;

-- Migration of in-flight legacy deliveries (spec: keep the ledger, never resend the ambiguous):
-- sent rows stay as the deduplication ledger; rows whose dispatch already started may or may
-- not have been sent, so they stay too and their schedules never join a digest; rows that were
-- never attempted are dropped, and their schedules are bundled again by the new claim.
delete from public.email_reminder_deliveries j
  where j.digest_at is null and j.sent_at is null and j.dispatch_started_at is null;

-- Builds the digest mail text. items: [{title, long, repeat}] ordered by due time.
-- Patterns: C = several decisions (with an extra line each for long / repeat members),
-- D = a decision already mailed once, B = planned 8+ days ahead, A = the classic wording.
-- The original payload keys are joined by 'site', which reserve uses to rebuild the text
-- after cancelled members drop out; the worker only reads from/to/subject/text.
create function public.email_reminder_digest_payload_(sender text, site_url text, user_email text, token uuid, items jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  n int := jsonb_array_length(items);
  first_title text := coalesce(items->0->>'title', '');
  subject text;
  body text;
begin
  if n >= 2 then
    subject := 'DECIDE.｜今日のふり返りが' || n || '件あります';
    body := '今日も一日、おつかれさまでした。' || E'\n' ||
      'ふり返りの日になった決断が' || n || '件あります。' || E'\n\n' ||
      (select string_agg('・「' || case when coalesce(it->>'title', '') <> '' then it->>'title' else '記録した決定' end || '」', E'\n' order by ord)
         from jsonb_array_elements(items) with ordinality as e(it, ord)) || E'\n\n' ||
      'やってみて、どうでしたか？ うまくいったことも、思っていたのと違ったことも、一言で大丈夫です。' || E'\n' ||
      'まだ動けていないものがあっても、「まだ動けていない」も今の記録になります。' || E'\n' ||
      '全部でなくても、気になるものから1つだけでも残してみてください。' || E'\n\n';
    if exists (select 1 from jsonb_array_elements(items) it where (it->>'long')::boolean) then
      body := body || '時間をかけるつもりだった決断は、結果がまだ先でも、途中の実感を残せます。' || E'\n\n';
    end if;
    if exists (select 1 from jsonb_array_elements(items) it where (it->>'repeat')::boolean) then
      body := body || 'この中に、前に一度お知らせした決断も含まれています。気が向いたものからで大丈夫です。' || E'\n\n';
    end if;
    body := body || 'DECIDE.を開いて、履歴から「その後」を残す：' || E'\n' || site_url;
  elsif (items->0->>'repeat')::boolean then
    subject := 'DECIDE.｜「' || case when first_title <> '' then first_title else '記録した決定' end || '」のふり返りが残っています';
    body := '「' || case when first_title <> '' then first_title else '記録した決定' end || '」は、前に一度お知らせした決断です。ふり返りの日を選び直して、今日がその日になりました。' || E'\n\n' ||
      '気が向いたときで大丈夫です。一言だけでも、今の実感を残してみてください。' || E'\n' ||
      'もちろん、まだでも構いません。「まだ動けていない」も今の記録になります。' || E'\n\n' ||
      'もうこの決断のお知らせが要らないときは、アプリの履歴からふり返りを書くか、日を外してください。' || E'\n\n' ||
      'DECIDE.を開いて、履歴からこの記録の「その後」を残す：' || E'\n' || site_url;
  elsif (items->0->>'long')::boolean then
    subject := 'DECIDE.｜「' || case when first_title <> '' then first_title else '記録した決定' end || '」、その後どうですか？';
    body := '「' || case when first_title <> '' then first_title else '記録した決定' end || '」を、少し先のふり返りに設定していました。' || E'\n\n' ||
      '時間がたって、状況や気持ちに変わったところはありますか？' || E'\n' ||
      '結果がまだ出ていなくても、途中の実感も今の記録になります。' || E'\n' ||
      '決めたときの自分と比べて、一言だけでも残してみてください。' || E'\n\n' ||
      '今の実感を残すと、次に似たことで迷ったとき、自分の経験を手がかりにできます。' || E'\n\n' ||
      'DECIDE.を開いて、履歴からこの記録の「その後」を残す：' || E'\n' || site_url;
  else
    subject := 'DECIDE.｜' || case when first_title <> '' then '「' || first_title || '」' else '記録した決定' end || 'を振り返ってみませんか？';
    body := case when first_title <> '' then '「' || first_title || '」を振り返る日に設定していました。' else '記録した決定を振り返る日に設定していました。' end || E'\n\n' ||
      'やってみて、どうでしたか？ 決めたときと、気持ちは変わりましたか？' || E'\n' ||
      'うまくいったことも、思っていたのと違ったことも、一言で大丈夫です。' || E'\n' ||
      'まだ動いていなければ、「まだ動けていない」も今の記録になります。' || E'\n\n' ||
      '今の実感を残すと、次に似たことで迷ったとき、自分の経験を手がかりにできます。' || E'\n\n' ||
      'DECIDE.を開いて、履歴からこの記録の「その後」を残す：' || E'\n' || site_url;
  end if;
  body := body || E'\n\n' ||
    'このメールは、DECIDE.で「メールでリマインド」をONにした方へお送りしています。' || E'\n' ||
    'リマインドメールを停止する（すべての端末）：' || E'\n' || site_url || '/unsubscribe?t=' || token::text || E'\n' ||
    'アプリの設定の「メールでリマインド」からも停止できます。';
  return jsonb_build_object('from', sender, 'to', jsonb_build_array(user_email),
    'subject', subject, 'text', body, 'site', site_url);
end;
$$;

-- Member list of a digest as the payload builder consumes it, recomputed from live rows so
-- claim and reserve see the same picture. A member whose schedule vanished simply has no row.
create function public.email_reminder_digest_items_(delivery uuid) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x.obj order by x.remind_at, x.log_id), '[]'::jsonb)
  from (
    select i.remind_at, i.log_id,
      jsonb_build_object(
        'title', i.title,
        'long', coalesce((i.remind_at - (select min(r.registered_at) from public.email_reminders r
                   where r.user_id = i.user_id and r.log_id = i.log_id and r.remind_at = i.remind_at)) >= interval '8 days', false),
        'repeat', exists (select 1 from public.email_reminder_deliveries h
                    where h.user_id = i.user_id and h.log_id = i.log_id and h.sent_at is not null)
               or exists (select 1 from public.email_reminder_delivery_items hi
                    join public.email_reminder_deliveries h on h.id = hi.delivery_id
                    where hi.user_id = i.user_id and hi.log_id = i.log_id and h.sent_at is not null)
      ) as obj
    from public.email_reminder_delivery_items i
    where i.delivery_id = delivery
  ) x;
$$;

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
      set payload = public.email_reminder_digest_payload_(sender, site_url, eu.email, tk.token, items_json)
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

-- Recheck cancellation immediately before the external send. A digest stays active while at
-- least one member schedule is still registered on an enabled device; reserve drops the rest.
create or replace function public.email_reminder_is_active(delivery uuid, lease uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.email_reminder_deliveries j join auth.users u on u.id = j.user_id
    where j.id = delivery and j.lease_token = lease and j.lease_until > now()
      and j.sent_at is null and j.failed_at is null and j.dispatch_started_at is null
      and u.email_confirmed_at is not null and j.payload->'to'->>0 = u.email
      and (
        (j.digest_at is not null
          and exists (select 1 from public.email_reminder_delivery_items i
            join public.email_reminders r on r.user_id = i.user_id and r.log_id = i.log_id and r.remind_at = i.remind_at
            join public.email_reminder_devices d on d.user_id = r.user_id and d.device_id = r.device_id
            where i.delivery_id = j.id and d.enabled))
        or
        (j.digest_at is null and j.remind_at > now() - interval '7 days'
          and exists (select 1 from public.email_reminders r join public.email_reminder_devices d using (user_id, device_id)
            where d.enabled and r.user_id = j.user_id and r.log_id = j.log_id and r.remind_at = j.remind_at))
      ));
$$;

-- Reserve BEFORE sending. An interrupted reserved delivery requires manual review.
-- For a digest, members whose schedule is gone (looked back, rescheduled, turned OFF) drop
-- out here and the text is rebuilt from what remains; if nothing remains, nothing is sent.
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
    items_json);
  update public.email_reminder_deliveries d set dispatch_started_at = now(), payload = rebuilt where d.id = delivery;
  return rebuilt;
end;
$$;

revoke all on function public.set_email_reminders(uuid, boolean, jsonb) from public, anon;
grant execute on function public.set_email_reminders(uuid, boolean, jsonb) to authenticated;
revoke all on function public.email_reminder_digest_at_(timestamptz), public.email_reminder_digest_payload_(text, text, text, uuid, jsonb), public.email_reminder_digest_items_(uuid) from public, anon, authenticated;
grant execute on function public.email_reminder_digest_at_(timestamptz), public.email_reminder_digest_payload_(text, text, text, uuid, jsonb), public.email_reminder_digest_items_(uuid) to service_role;
revoke all on function public.claim_email_reminders(text, text), public.email_reminder_is_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_email_reminders(text, text), public.email_reminder_is_active(uuid, uuid) to service_role;
revoke all on function public.reserve_email_reminder(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_email_reminder(uuid, uuid) to service_role;

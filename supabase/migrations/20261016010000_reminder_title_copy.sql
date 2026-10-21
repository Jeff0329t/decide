-- Title is explicitly described in the email setting; legacy clients remain compatible.
alter table public.email_reminders add column title text not null default '' check (length(title) <= 60);

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
    reminder_title := btrim(regexp_replace(coalesce(item->>'title', ''), E'[\\r\\n\\t]+', ' ', 'g'));
    log := item->>'id';
    if length(log) not between 1 and 100 or log = any(ids) then raise exception 'invalid id' using errcode = '22023'; end if;
    at := (item->>'remindAt')::timestamptz;
    if not isfinite(at) then raise exception 'invalid date' using errcode = '22023'; end if;
    insert into public.email_reminders (user_id, device_id, log_id, remind_at, title)
      values (uid, device, log, at, reminder_title)
      on conflict (user_id, device_id, log_id) do update set remind_at = excluded.remind_at, title = excluded.title;
    ids := array_append(ids, log);
  end loop;
  delete from public.email_reminders r where r.user_id = uid and r.device_id = device and not (r.log_id = any(ids));
end;
$$;

create or replace function public.claim_email_reminders(sender text, site_url text)
returns setof public.email_reminder_deliveries
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.email_reminder_deliveries (user_id, log_id, remind_at, payload)
  select r.user_id, r.log_id, r.remind_at,
    jsonb_build_object('from', sender, 'to', jsonb_build_array(u.email),
      'subject', 'DECIDE.｜' || case when max(r.title) <> '' then '「' || max(r.title) || '」' else '記録した決定' end || 'を振り返ってみませんか？',
      'text', case when max(r.title) <> '' then '「' || max(r.title) || '」を振り返る日に設定していました。' else '記録した決定を振り返る日に設定していました。' end || E'\n\n' || 'やってみて、どうでしたか？ 決めたときと、気持ちは変わりましたか？' || E'\n' || 'うまくいったことも、思っていたのと違ったことも、一言で大丈夫です。' || E'\n' || 'まだ動いていなければ、「まだ動けていない」も今の記録になります。' || E'\n\n' || '今の実感を残すと、次に似たことで迷ったとき、自分の経験を手がかりにできます。' || E'\n\n' || 'DECIDEを開いて、履歴からこの記録の「その後」を残す：' || E'\n' || site_url || E'\n\n' ||
        'このメールは、DECIDEで「メールでリマインド」をONにした方へお送りしています。' || E'\n' ||
        '停止するには、登録した端末の設定で「メールでリマインド」をOFFにしてください。')
  from public.email_reminders r
  join public.email_reminder_devices d using (user_id, device_id)
  join auth.users u on u.id = r.user_id
  where d.enabled and u.email_confirmed_at is not null and u.email <> ''
    and r.remind_at <= now() and r.remind_at > now() - interval '7 days'
    and not exists (select 1 from public.email_reminder_deliveries j where j.user_id = r.user_id and j.log_id = r.log_id and j.remind_at = r.remind_at)
  group by r.user_id, r.log_id, r.remind_at, u.email
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

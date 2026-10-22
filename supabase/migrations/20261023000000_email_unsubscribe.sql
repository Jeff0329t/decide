-- Every reminder email carries a stop link, so reminders can be stopped without the registered device
-- (lost phone, cleared site data). The link stops the whole account, on every device.
-- One random token per account; the link page posts it to email_unsubscribe (opening the link alone stops nothing,
-- so mail scanners that prefetch links cannot unsubscribe anyone).
create table public.email_unsubscribe_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token uuid not null unique default gen_random_uuid()
);
alter table public.email_unsubscribe_tokens enable row level security;
revoke all on public.email_unsubscribe_tokens from anon, authenticated;
grant all on public.email_unsubscribe_tokens to service_role;

-- Turning every device OFF also makes queued deliveries inactive (email_reminder_is_active requires an enabled device).
create function public.stop_all_email_reminders_(uid uuid) returns void
language sql security definer set search_path = public
as $$
  update public.email_reminder_devices d set enabled = false where d.user_id = uid;
  delete from public.email_reminders r where r.user_id = uid;
$$;

-- From the stop link. Returns false for an unknown token.
create function public.email_unsubscribe(token uuid) returns boolean
language plpgsql security definer set search_path = public
as $$
declare uid uuid;
begin
  select t.user_id into uid from public.email_unsubscribe_tokens t where t.token = email_unsubscribe.token;
  if uid is null then return false; end if;
  perform public.stop_all_email_reminders_(uid);
  return true;
end;
$$;

-- From the app settings: stop this account on every device, including ones no longer at hand.
create function public.disable_all_email_reminders() returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform public.stop_all_email_reminders_(auth.uid());
end;
$$;

create or replace function public.claim_email_reminders(sender text, site_url text)
returns setof public.email_reminder_deliveries
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.email_unsubscribe_tokens (user_id)
  select distinct r.user_id from public.email_reminders r
  where r.remind_at <= now() and r.remind_at > now() - interval '7 days'
  on conflict (user_id) do nothing;

  insert into public.email_reminder_deliveries (user_id, log_id, remind_at, payload)
  select r.user_id, r.log_id, r.remind_at,
    jsonb_build_object('from', sender, 'to', jsonb_build_array(u.email),
      'subject', 'DECIDE.｜' || case when max(r.title) <> '' then '「' || max(r.title) || '」' else '記録した決定' end || 'を振り返ってみませんか？',
      'text', case when max(r.title) <> '' then '「' || max(r.title) || '」を振り返る日に設定していました。' else '記録した決定を振り返る日に設定していました。' end || E'\n\n' || 'やってみて、どうでしたか？ 決めたときと、気持ちは変わりましたか？' || E'\n' || 'うまくいったことも、思っていたのと違ったことも、一言で大丈夫です。' || E'\n' || 'まだ動いていなければ、「まだ動けていない」も今の記録になります。' || E'\n\n' || '今の実感を残すと、次に似たことで迷ったとき、自分の経験を手がかりにできます。' || E'\n\n' || 'DECIDE.を開いて、履歴からこの記録の「その後」を残す：' || E'\n' || site_url || E'\n\n' ||
        'このメールは、DECIDE.で「メールでリマインド」をONにした方へお送りしています。' || E'\n' ||
        'リマインドメールを停止する（すべての端末）：' || E'\n' || site_url || '/unsubscribe?t=' || t.token::text || E'\n' ||
        'アプリの設定の「メールでリマインド」からも停止できます。')
  from public.email_reminders r
  join public.email_reminder_devices d using (user_id, device_id)
  join auth.users u on u.id = r.user_id
  join public.email_unsubscribe_tokens t on t.user_id = r.user_id
  where d.enabled and u.email_confirmed_at is not null and u.email <> ''
    and r.remind_at <= now() and r.remind_at > now() - interval '7 days'
    and not exists (select 1 from public.email_reminder_deliveries j where j.user_id = r.user_id and j.log_id = r.log_id and j.remind_at = r.remind_at)
  group by r.user_id, r.log_id, r.remind_at, u.email, t.token
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

revoke all on function public.stop_all_email_reminders_(uuid) from public, anon, authenticated;
revoke all on function public.email_unsubscribe(uuid) from public;
revoke all on function public.disable_all_email_reminders() from public, anon;
grant execute on function public.email_unsubscribe(uuid) to anon, authenticated;
grant execute on function public.disable_all_email_reminders() to authenticated;
revoke all on function public.claim_email_reminders(text, text) from public, anon, authenticated;
grant execute on function public.claim_email_reminders(text, text) to service_role;

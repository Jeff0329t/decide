-- DECIDE: プッシュ通知の予定を「端末（通知の宛先）ごと」に持つ
-- これまでは予定を人ごとに1セットで持っていたため、ある端末が予定を送ると、ほかの端末の予定が消えていた。
-- 予定に宛先（endpoint）を持たせ、送ってきた端末の予定だけを置きかえる。
-- 既存の予定はいったん消す（各端末が次に開いたとき送り直す）。

delete from public.push_reminders;

alter table public.push_reminders drop constraint if exists push_reminders_pkey;
alter table public.push_reminders add column if not exists endpoint text not null;
alter table public.push_reminders drop constraint if exists push_reminders_endpoint_fkey;
alter table public.push_reminders
  add constraint push_reminders_endpoint_fkey
  foreign key (endpoint) references public.push_subscriptions(endpoint) on delete cascade;
alter table public.push_reminders add primary key (user_id, endpoint, log_id);

create index if not exists push_reminders_due_idx on public.push_reminders (remind_at) where sent_at is null;

-- 通知の宛先を保存する（同じ宛先が別の人のものだったら、いまログインしている人に付けかえ、前の人の予定は消す）
create or replace function public.save_push_subscription(endpoint text, p256dh text, auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e text := btrim(coalesce(save_push_subscription.endpoint, ''));
  k text := btrim(coalesce(save_push_subscription.p256dh, ''));
  a text := btrim(coalesce(save_push_subscription.auth, ''));
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if e !~ '^https://' or length(e) > 2000 or k = '' or length(k) > 200 or a = '' or length(a) > 100 then
    raise exception 'invalid subscription' using errcode = '22023';
  end if;

  delete from public.push_reminders pr
  where pr.endpoint = e and pr.user_id <> uid;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, e, k, a)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

drop function if exists public.set_push_reminders(jsonb);

-- この端末（endpoint）のふり返り前の予定をまるごと置きかえる。items: [{"id": "...", "remindAt": "ISO日時"}]（最大500件）
-- 予定日時が変わったものだけ「送信済み」を戻す。この端末の予定でリストにないものは消す（ほかの端末の予定には触れない）。
create or replace function public.set_push_reminders(items jsonb, endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e text := btrim(coalesce(set_push_reminders.endpoint, ''));
  list jsonb := coalesce(set_push_reminders.items, '[]'::jsonb);
  item jsonb;
  ids text[] := '{}';
  log text;
  at timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.push_subscriptions ps where ps.endpoint = e and ps.user_id = uid) then
    raise exception 'unknown subscription' using errcode = '22023';
  end if;

  if jsonb_typeof(list) <> 'array' or jsonb_array_length(list) > 500 then
    raise exception 'invalid items' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(list) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'id') <> 'string' or jsonb_typeof(item->'remindAt') <> 'string' then
      raise exception 'invalid items' using errcode = '22023';
    end if;
    log := item->>'id';
    if length(log) < 1 or length(log) > 100 then
      raise exception 'invalid items' using errcode = '22023';
    end if;
    begin
      at := (item->>'remindAt')::timestamptz;
    exception when others then
      raise exception 'invalid items' using errcode = '22023';
    end;

    insert into public.push_reminders (user_id, endpoint, log_id, remind_at)
    values (uid, e, log, at)
    on conflict (user_id, endpoint, log_id) do update
      set remind_at = excluded.remind_at,
          sent_at = case when public.push_reminders.remind_at = excluded.remind_at then public.push_reminders.sent_at else null end;
    ids := array_append(ids, log);
  end loop;

  delete from public.push_reminders pr
  where pr.user_id = uid and pr.endpoint = e and not (pr.log_id = any(ids));
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public;
revoke execute on function public.save_push_subscription(text, text, text) from anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

revoke execute on function public.set_push_reminders(jsonb, text) from public;
revoke execute on function public.set_push_reminders(jsonb, text) from anon;
grant execute on function public.set_push_reminders(jsonb, text) to authenticated;

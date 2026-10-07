-- DECIDE: プッシュ通知（ログインした人だけ）
-- push_subscriptions: 通知の宛先（ブラウザの購読情報）。push_reminders: ふり返り前のログの {log_id, remind_at} だけ（ログの中身は持たない）。
-- 書き込みは下の3つの関数（security definer）からだけ。本人は自分の行を読むことだけできる。
-- 送信は Edge Function send-reminders（service_role）が pg_cron から定期的に行う。
-- アカウント削除時は auth.users の ON DELETE CASCADE で消える。

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 2000),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id text not null check (length(log_id) between 1 and 100),
  remind_at timestamptz not null,
  sent_at timestamptz,
  primary key (user_id, log_id)
);

create index if not exists push_reminders_due_idx on public.push_reminders (remind_at) where sent_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.push_reminders enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_reminders_select_own on public.push_reminders;
create policy push_reminders_select_own on public.push_reminders
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.push_subscriptions from anon;
revoke all on public.push_subscriptions from authenticated;
grant select on public.push_subscriptions to authenticated;

revoke all on public.push_reminders from anon;
revoke all on public.push_reminders from authenticated;
grant select on public.push_reminders to authenticated;

-- 通知の宛先を保存する（同じ宛先が別の人のものだったら、いまログインしている人に付けかえる）
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

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, e, k, a)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- 通知の宛先を消す（自分のものだけ）
create or replace function public.delete_push_subscription(endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.push_subscriptions ps
  where ps.user_id = uid and ps.endpoint = delete_push_subscription.endpoint;
end;
$$;

-- ふり返り前の予定をまるごと置きかえる。items: [{"id": "...", "remindAt": "ISO日時"}]（最大500件）
-- 予定日時が変わったものだけ「送信済み」を戻す。リストにないものは消す。
create or replace function public.set_push_reminders(items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  list jsonb := coalesce(set_push_reminders.items, '[]'::jsonb);
  item jsonb;
  ids text[] := '{}';
  log text;
  at timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
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

    insert into public.push_reminders (user_id, log_id, remind_at)
    values (uid, log, at)
    on conflict (user_id, log_id) do update
      set remind_at = excluded.remind_at,
          sent_at = case when public.push_reminders.remind_at = excluded.remind_at then public.push_reminders.sent_at else null end;
    ids := array_append(ids, log);
  end loop;

  delete from public.push_reminders pr
  where pr.user_id = uid and not (pr.log_id = any(ids));
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public;
revoke execute on function public.save_push_subscription(text, text, text) from anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

revoke execute on function public.delete_push_subscription(text) from public;
revoke execute on function public.delete_push_subscription(text) from anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

revoke execute on function public.set_push_reminders(jsonb) from public;
revoke execute on function public.set_push_reminders(jsonb) from anon;
grant execute on function public.set_push_reminders(jsonb) to authenticated;

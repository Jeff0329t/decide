-- DECIDE. ログイン・無料枠・課金（買い切り）
-- 決定ログ本文はDBに保存しない。プロフィールとStripeイベントの冪等管理のみ。

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan_type text not null default 'free' check (plan_type in ('free','lifetime','monthly','yearly')),
  pro_since timestamptz,
  draw_count integer not null default 0 check (draw_count >= 0),
  created_at timestamptz not null default now()
);

-- Webhookの冪等性（同じeventを二重処理しない）。service_roleのみが書き込む。
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.stripe_events enable row level security;

-- 本人の行だけ読める。INSERT/UPDATE/DELETEのポリシーは作らない
-- （= クライアントからplan_type・pro_sinceを含め一切書き換え不可）。
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
-- stripe_events はポリシーなし（クライアントからは読み書き不可）。

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke all on public.stripe_events from anon, authenticated;

-- サインアップ時にprofiles行を作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 引いた回数を+1（plan_type・pro_sinceには触れない）
create or replace function public.record_draw()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
     set draw_count = draw_count + 1
   where id = auth.uid()
  returning draw_count into next_count;
  return coalesce(next_count, 0);
end;
$$;

-- ログイン時の端末カウントとの統合：合算せず max(端末, DB) を採用
create or replace function public.merge_local_draws(p_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
     set draw_count = greatest(draw_count, least(greatest(coalesce(p_count, 0), 0), 100000))
   where id = auth.uid()
  returning draw_count into next_count;
  return coalesce(next_count, 0);
end;
$$;

revoke all on function public.record_draw() from public, anon;
revoke all on function public.merge_local_draws(integer) from public, anon;
grant execute on function public.record_draw() to authenticated;
grant execute on function public.merge_local_draws(integer) to authenticated;

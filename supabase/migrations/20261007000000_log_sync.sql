-- DECIDE: 決定ログの端末間同期（PRO・設定でONにした人だけ）
-- 本人の行だけ読み書きでき、PRO（plan_type <> 'free'）でなければ書けない・読めない。
-- 削除は deleted = true の行（墓標）として残し、他の端末に削除を伝える。
-- アカウント削除時は auth.users の ON DELETE CASCADE で全行消える。

create table if not exists public.decision_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint decision_logs_data_size check (data is null or octet_length(data::text) <= 200000)
);

create or replace function public.decision_logs_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.deleted then new.data := null; end if;
  return new;
end;
$$;

drop trigger if exists decision_logs_touch on public.decision_logs;
create trigger decision_logs_touch
  before insert or update on public.decision_logs
  for each row execute function public.decision_logs_touch();

alter table public.decision_logs enable row level security;

drop policy if exists decision_logs_select_own on public.decision_logs;
create policy decision_logs_select_own on public.decision_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan_type <> 'free')
  );

drop policy if exists decision_logs_insert_own on public.decision_logs;
create policy decision_logs_insert_own on public.decision_logs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan_type <> 'free')
  );

drop policy if exists decision_logs_update_own on public.decision_logs;
create policy decision_logs_update_own on public.decision_logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan_type <> 'free')
  );

revoke all on public.decision_logs from anon;
revoke all on public.decision_logs from authenticated;
grant select, insert, update on public.decision_logs to authenticated;

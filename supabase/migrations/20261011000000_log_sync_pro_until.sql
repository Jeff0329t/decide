-- DECIDE: 決定ログ同期の RLS を、アプリの PRO 判定（entitlements.js）と揃える。
-- これまでは plan_type <> 'free' だけを見ていたため、招待報酬（profiles.pro_until）で
-- 期限付き UNLIMITED になった人は、画面上は同期ONにできても読み書きが RLS で拒否されていた。

create or replace function public.has_pro_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.plan_type <> 'free' or (p.pro_until is not null and p.pro_until > now()))
  );
$$;

revoke all on function public.has_pro_access() from public;
grant execute on function public.has_pro_access() to authenticated;

drop policy if exists decision_logs_select_own on public.decision_logs;
create policy decision_logs_select_own on public.decision_logs
  for select to authenticated
  using (user_id = auth.uid() and public.has_pro_access());

drop policy if exists decision_logs_insert_own on public.decision_logs;
create policy decision_logs_insert_own on public.decision_logs
  for insert to authenticated
  with check (user_id = auth.uid() and public.has_pro_access());

drop policy if exists decision_logs_update_own on public.decision_logs;
create policy decision_logs_update_own on public.decision_logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.has_pro_access());

-- DECIDE: 購入の記録（決済1回につき1行）
-- 返金が来たとき「どの購入の返金か」を区別するために使う。古い購入の返金で、新しい購入のUNLIMITEDが外れないようにする。
-- 書き込みは stripe-webhook（service_role）からだけ。利用者からは読めない・書けない。
-- アカウント削除時は auth.users の ON DELETE CASCADE で消える。

create table if not exists public.purchases (
  checkout_session_id text primary key,
  payment_intent text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('paid', 'refunded')),
  amount integer,
  currency text,
  created_at timestamptz not null default now(),
  refunded_at timestamptz
);

create index if not exists purchases_user_idx on public.purchases (user_id);

alter table public.purchases enable row level security;

revoke all on public.purchases from anon;
revoke all on public.purchases from authenticated;

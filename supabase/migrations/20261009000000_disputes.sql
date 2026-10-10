-- DECIDE: チャージバック（Stripe dispute）の記録
-- stripe-webhook（service_role）が charge.dispute.created / closed を受けて書き込む。
-- PRO の剥奪は自動では行わない（運用で判断し、必要なら profiles を手で更新する）。
-- user_id は auth.users を参照しない：アカウント削除後も経緯を残すため。

create table if not exists public.stripe_disputes (
  id text primary key,                 -- dp_...
  charge_id text not null,
  payment_intent_id text,
  user_id uuid,                        -- 購入者が特定できなかった場合は null
  amount integer not null,
  currency text not null,
  reason text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_disputes_user_idx on public.stripe_disputes (user_id);

alter table public.stripe_disputes enable row level security;
-- ポリシーなし（クライアントからは読み書き不可）。
revoke all on public.stripe_disputes from anon, authenticated;

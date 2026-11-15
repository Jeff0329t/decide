-- DECIDE: 店舗紹介報酬（QR・店舗別URL）
-- partner_channels: 紹介先マスタ。partner_attributions: 「どの利用者が・どの店舗から来たか」だけを記録する（ログの中身は持たない）。
-- partner_conversions: 購入が成立したときだけ立つ成果記録（1決済1行、利用者につき confirmed は1件まで。stripe-webhook からだけ書く）。
-- partner_notification_log / partner_payouts: 日次通知の送信履歴と月次精算（フェーズ2・3で使う器をここで用意する）。
-- 書き込みは bind_partner_attribution（security definer）と stripe-webhook / 運営SQL（service_role）からだけ。利用者からは読めない・書けない。
-- アカウント削除時は auth.users の ON DELETE CASCADE で消える。
-- 設計の正: workspace/goals/web-100/files/DECIDE-紹介報酬-最小実装仕様.md

create table if not exists public.partner_channels (
  code text primary key check (code ~ '^[a-z0-9-]{3,32}$'),
  name text not null,
  -- 日次通知の宛先。店舗に確認するまで未設定（null）を許す。フェーズ2の通知は宛先がある店舗だけに送る
  email text,
  reward_jpy integer not null default 200 check (reward_jpy >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_attributions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  partner_code text not null references public.partner_channels(code),
  captured_at timestamptz not null,
  bound_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists partner_attributions_partner_idx on public.partner_attributions (partner_code);

create table if not exists public.partner_conversions (
  checkout_session_id text primary key references public.purchases(checkout_session_id),
  partner_code text not null references public.partner_channels(code),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reward_jpy integer not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'refunded', 'disputed')),
  created_at timestamptz not null default now(),
  refunded_at timestamptz
);

create index if not exists partner_conversions_partner_idx on public.partner_conversions (partner_code, created_at);
create index if not exists partner_conversions_user_idx on public.partner_conversions (user_id);

create table if not exists public.partner_notification_log (
  id uuid primary key default gen_random_uuid(),
  partner_code text not null references public.partner_channels(code),
  window_start timestamptz not null,
  window_end timestamptz not null,
  purchase_count integer not null,
  reward_total integer not null,
  monthly_count integer not null,
  monthly_total integer not null,
  sent_at timestamptz not null default now(),
  unique (partner_code, window_end)
);

create table if not exists public.partner_payouts (
  partner_code text not null references public.partner_channels(code),
  month date not null,
  count integer not null,
  total_jpy integer not null,
  carried_jpy integer not null default 0,
  paid_at timestamptz,
  note text,
  primary key (partner_code, month)
);

alter table public.partner_channels enable row level security;
alter table public.partner_attributions enable row level security;
alter table public.partner_conversions enable row level security;
alter table public.partner_notification_log enable row level security;
alter table public.partner_payouts enable row level security;

revoke all on public.partner_channels from anon;
revoke all on public.partner_channels from authenticated;
revoke all on public.partner_attributions from anon;
revoke all on public.partner_attributions from authenticated;
revoke all on public.partner_conversions from anon;
revoke all on public.partner_conversions from authenticated;
revoke all on public.partner_notification_log from anon;
revoke all on public.partner_notification_log from authenticated;
revoke all on public.partner_payouts from anon;
revoke all on public.partner_payouts from authenticated;

-- 店舗紹介をサーバーに記録する。返り値: 'ok' / 'already'（別の店舗が先に記録済み＝ファーストタッチ優先）/
-- 'expired'（取得から30日を過ぎた）/ 'invalid'（コードの形が違う・店舗がない・停止中）
create or replace function public.bind_partner_attribution(p_code text, p_captured_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wanted text := lower(btrim(coalesce(p_code, '')));
  channel_active boolean;
  captured timestamptz := p_captured_at;
  inserted int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if wanted !~ '^[a-z0-9-]{3,32}$' or captured is null then
    return 'invalid';
  end if;

  select pc.active into channel_active from public.partner_channels pc where pc.code = wanted;
  if channel_active is null or not channel_active then
    return 'invalid';
  end if;

  -- 端末の時計が未来を指していたら、サーバー時刻を上限にする
  if captured > now() then
    captured := now();
  end if;
  -- 取得から30日を過ぎていたら期限切れ（30日ちょうどは有効）
  if captured < now() - interval '30 days' then
    return 'expired';
  end if;

  insert into public.partner_attributions (user_id, partner_code, captured_at)
  values (uid, wanted, captured)
  on conflict (user_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return 'already';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.bind_partner_attribution(text, timestamptz) from public;
revoke execute on function public.bind_partner_attribution(text, timestamptz) from anon;
grant execute on function public.bind_partner_attribution(text, timestamptz) to authenticated;

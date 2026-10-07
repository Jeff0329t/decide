-- DECIDE: 友だち招待（ログインした人だけ）
-- referral_codes: 1人1つの招待コード。referrals: 「だれが・だれを招待したか」だけを記録する（ログの中身は持たない）。
-- 書き込みは下の2つの関数（security definer）からだけ。本人は自分の行を読むことだけできる。
-- アカウント削除時は auth.users の ON DELETE CASCADE で消える。
-- TODO: 招待の特典（何を・いつ付けるか）は未定。決まったら claim_referral の 'ok' の前で付ける。

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4,16}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint referrals_not_self check (referrer_id <> referred_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own on public.referral_codes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid());

revoke all on public.referral_codes from anon;
revoke all on public.referral_codes from authenticated;
grant select on public.referral_codes to authenticated;

revoke all on public.referrals from anon;
revoke all on public.referrals from authenticated;
grant select on public.referrals to authenticated;

-- 自分の招待コードを返す（なければ8文字で作る。まぎらわしい 0/O/1/I/L は使わない）
create or replace function public.get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  existing text;
  candidate text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select rc.code into existing from public.referral_codes rc where rc.user_id = uid;
  if existing is not null then
    return existing;
  end if;

  for attempt in 1..10 loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.referral_codes (user_id, code) values (uid, candidate);
      return candidate;
    exception when unique_violation then
      -- 同時に作られた／コードがかぶった → 自分の行があればそれを返す、なければ作り直す
      select rc.code into existing from public.referral_codes rc where rc.user_id = uid;
      if existing is not null then
        return existing;
      end if;
    end;
  end loop;

  raise exception 'could not create referral code';
end;
$$;

-- 招待コードを使う。返り値: 'ok' / 'self'（自分のコード）/ 'already'（もう記録済み）/ 'invalid'（コードがない）
create or replace function public.claim_referral(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wanted text := upper(btrim(coalesce(claim_referral.code, '')));
  referrer uuid;
  inserted int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if wanted !~ '^[A-Z0-9]{4,16}$' then
    return 'invalid';
  end if;

  select rc.user_id into referrer from public.referral_codes rc where rc.code = wanted;
  if referrer is null then
    return 'invalid';
  end if;

  if referrer = uid then
    return 'self';
  end if;

  insert into public.referrals (referrer_id, referred_id)
  values (referrer, uid)
  on conflict (referred_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return 'already';
  end if;

  -- TODO: 招待の特典はここで付ける（未定）
  return 'ok';
end;
$$;

revoke execute on function public.get_or_create_referral_code() from public;
revoke execute on function public.get_or_create_referral_code() from anon;
grant execute on function public.get_or_create_referral_code() to authenticated;

revoke execute on function public.claim_referral(text) from public;
revoke execute on function public.claim_referral(text) from anon;
grant execute on function public.claim_referral(text) to authenticated;

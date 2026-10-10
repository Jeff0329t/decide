-- DECIDE: 招待の特典
-- 招待リンクから始めた人（された側）と、招待した人の両方に UNLIMITED を一定期間プレゼントする。
-- 期限付きの UNLIMITED は profiles.pro_until で持つ（plan_type は買い切りの購入状態だけを表すので触らない）。
-- 期間・上限を変えるときは下の claim_referral の定数（reward / referrer_cap）を書き換える。

alter table public.profiles add column if not exists pro_until timestamptz;

create or replace function public.claim_referral(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wanted text := upper(btrim(coalesce(claim_referral.code, '')));
  -- 特典の期間
  reward constant interval := interval '3 days';
  -- 招待した側が特典をもらえる人数の上限（それ以降も招待の記録は残る）
  referrer_cap constant int := 5;
  referrer uuid;
  inserted int;
  referred_total int;
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

  -- 残りの期間があれば、そこから延ばす
  update public.profiles
     set pro_until = greatest(coalesce(pro_until, now()), now()) + reward
   where id = uid;

  select count(*) into referred_total from public.referrals r where r.referrer_id = referrer;
  if referred_total <= referrer_cap then
    update public.profiles
       set pro_until = greatest(coalesce(pro_until, now()), now()) + reward
     where id = referrer;
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.claim_referral(text) from public;
revoke execute on function public.claim_referral(text) from anon;
grant execute on function public.claim_referral(text) to authenticated;

-- DECIDE: 招待の特典を、招待リンクから新しく始めた人に限る。
-- これまでは既存のアカウントでも1回だけ特典を受け取れた（画面の説明は「このリンクから始めた人」）。
-- アカウント作成から new_user_window 以内の人だけを対象にする（ログイン後の通信失敗で再試行する余裕を見て7日）。
-- 対象外のときは招待の記録も作らず 'not_new' を返す（招待した側にも特典はつかない）。

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
  -- 新しく始めた人とみなす、アカウント作成からの期間
  new_user_window constant interval := interval '7 days';
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

  if not exists (select 1 from auth.users u where u.id = uid and u.created_at > now() - new_user_window) then
    return 'not_new';
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

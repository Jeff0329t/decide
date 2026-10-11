-- DECIDE: 決済セッション作成の排他ロック（利用者 × 商品ごとに1行）
-- 「開いているセッションを探す → なければ作る」は原子的でないため、同時リクエスト（二重タップ・複数タブ）が
-- それぞれセッションを作ってしまう。作成する権利をこの表の主キーで1リクエストだけに与える。
-- 時間枠ベースの冪等キーは枠の境目（例 03:09:59.999 と 03:10:00.000）をまたぐと別キーになるため使わない。
-- 読み書きは create-checkout（service_role）からだけ。利用者からは読めない・書けない。
-- アカウント削除時は auth.users の ON DELETE CASCADE で消える。

create table if not exists public.checkout_locks (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null,
  lock_id uuid not null,            -- 権利を持つリクエストの識別子。Stripe の冪等キーにも使う
  session_id text,                  -- 作成済みのセッション（作成中は null）
  session_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,  -- これを過ぎたロックは別のリクエストが引き継げる
  primary key (user_id, product)
);

alter table public.checkout_locks enable row level security;
-- ポリシーは作らない（service_role 以外は一切アクセス不可）

revoke all on public.checkout_locks from anon;
revoke all on public.checkout_locks from authenticated;

-- 作成する権利を原子的に取る。
-- 行がなければ挿入して勝ち。行があっても期限切れ、または呼び出し側が「もう開いていない」と確認した
-- ロック（p_stale_lock と lock_id が一致）なら上書きして勝ち。それ以外は負けで、今の行をそのまま返す。
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE は同じ主キーに対して直列化されるので、勝つのは常に1件だけ。
create or replace function public.claim_checkout_lock(
  p_user uuid,
  p_product text,
  p_lock uuid,
  p_ttl_seconds integer,
  p_stale_lock uuid default null
)
returns table (won boolean, lock_id uuid, session_id text, session_url text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_won uuid;
begin
  insert into public.checkout_locks as l (user_id, product, lock_id, session_id, session_url, created_at, expires_at)
  values (p_user, p_product, p_lock, null, null, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (user_id, product) do update
    set lock_id = excluded.lock_id,
        session_id = null,
        session_url = null,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    where l.expires_at < now()
       or (p_stale_lock is not null and l.lock_id = p_stale_lock)
  returning l.lock_id into v_won;

  if v_won = p_lock then
    return query select true, p_lock, null::text, null::text, now() + make_interval(secs => p_ttl_seconds);
    return;
  end if;

  return query
    select false, l.lock_id, l.session_id, l.session_url, l.expires_at
    from public.checkout_locks l
    where l.user_id = p_user and l.product = p_product;
end;
$$;

-- 作成したセッションをロックに記録し、期限を延ばす（自分のロックのときだけ）。
create or replace function public.complete_checkout_lock(
  p_user uuid,
  p_product text,
  p_lock uuid,
  p_session_id text,
  p_session_url text,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.checkout_locks
     set session_id = p_session_id,
         session_url = p_session_url,
         expires_at = now() + make_interval(secs => p_ttl_seconds)
   where user_id = p_user and product = p_product and lock_id = p_lock;
  return found;
end;
$$;

-- 作成に失敗したときにロックを手放す（自分のロックのときだけ）。すぐに再試行できるようにする。
create or replace function public.release_checkout_lock(p_user uuid, p_product text, p_lock uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.checkout_locks
   where user_id = p_user and product = p_product and lock_id = p_lock;
$$;

revoke all on function public.claim_checkout_lock(uuid, text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_checkout_lock(uuid, text, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.release_checkout_lock(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_checkout_lock(uuid, text, uuid, integer, uuid) to service_role;
grant execute on function public.complete_checkout_lock(uuid, text, uuid, text, text, integer) to service_role;
grant execute on function public.release_checkout_lock(uuid, text, uuid) to service_role;

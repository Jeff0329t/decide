// Usage: npm install --prefix /tmp/decide-referral-validation @electric-sql/pglite
// node scripts/verify-referral-db.mjs /tmp/decide-referral-validation/node_modules/@electric-sql/pglite/dist/index.js
// Runs the real referral migrations/RPCs in disposable PostgreSQL; never connects to production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const owner='00000000-0000-4000-8000-000000000001', fresh='00000000-0000-4000-8000-000000000002', old='00000000-0000-4000-8000-000000000003';
let assertions=0;
const eq=(actual,expected)=>{ assert.deepEqual(actual,expected); assertions++; };
const as=uid=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
const claim=async(uid,code)=>{ await as(uid); return (await db.query('select public.claim_referral($1) as r',[code])).rows[0].r; };
const until=async uid=>(await db.query('select pro_until is not null as has from public.profiles where id=$1',[uid])).rows[0]?.has;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key, email text, created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  for(const name of ['20261005000000_billing','20261008000000_referrals','20261010000000_referral_rewards','20261024000000_referral_new_users_only']) {
    await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  }
  await db.query(`insert into auth.users(id,email,created_at) values ($1,'owner@example.test',now()-interval '90 days'),
    ($2,'fresh@example.test',now()-interval '1 hour'),($3,'old@example.test',now()-interval '30 days')`,[owner,fresh,old]);
  await db.query(`insert into public.profiles(id) values ($1),($2),($3) on conflict do nothing`,[owner,fresh,old]);
  await as(owner);
  const code=(await db.query('select public.get_or_create_referral_code() as c')).rows[0].c;

  // An existing account gets nothing, and the inviter gets nothing for it.
  eq(await claim(old,code),'not_new');
  eq((await db.query('select count(*)::int as n from public.referrals')).rows[0].n,0);
  eq(await until(old),false);
  eq(await until(owner),false);
  // A new account still gets the reward, and so does the inviter.
  eq(await claim(fresh,code),'ok');
  eq(await until(fresh),true);
  eq(await until(owner),true);
  eq(await claim(fresh,code),'already');
  eq(await claim(owner,code),'self');
  eq(await claim(fresh,'NOPE1'),'invalid');
  console.log(`REFERRAL_DATABASE_OK ${assertions}`);
} finally { await db.close(); }

// Usage: npm install --prefix /tmp/decide-email-validation @electric-sql/pglite
// node scripts/verify-email-reminders-db.mjs /tmp/decide-email-validation/node_modules/@electric-sql/pglite/dist/index.js
// Runs the real migration/RPCs in disposable PostgreSQL; never connects to production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const alice='00000000-0000-4000-8000-000000000001', bob='00000000-0000-4000-8000-000000000002';
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002';
let assertions=0;
const eq=(actual,expected)=>{ assert.deepEqual(actual,expected); assertions++; };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261016000000_email_reminders.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261016010000_reminder_title_copy.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261022000000_reminder_brand_dot.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261023000000_email_unsubscribe.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users values ($1,$2,now()),($3,$4,now())',[alice,'alice@example.test',bob,'bob@example.test']);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
  const due=(await db.query("select (now()-interval '1 minute')::text as at")).rows[0].at;
  const snapshot=[{id:'log-a',remindAt:due}];
  const set=(device,on,items=snapshot)=>db.query('select public.set_email_reminders($1,$2,$3)',[device,on,JSON.stringify(items)]);
  const claim=async()=> (await db.query('select * from public.claim_email_reminders($1,$2)',['DECIDE <remind@example.test>','https://example.test'])).rows;
  const active=async job=>(await db.query('select public.email_reminder_is_active($1,$2) as ok',[job.id,job.lease_token])).rows[0].ok;
  const reserve=async job=>(await db.query('select public.reserve_email_reminder($1,$2) as payload',[job.id,job.lease_token])).rows[0].payload;
  const complete=async(job,ok)=>(await db.query('select public.complete_email_reminder($1,$2,$3) as ok',[job.id,job.lease_token,ok])).rows[0].ok;

  eq((await db.query('select public.get_email_reminder_setting($1) as on',[a])).rows[0].on,false);
  await db.exec('set role authenticated');
  await set(a,true); await set(b,true);
  await assert.rejects(db.query('select * from public.email_reminders')); assertions++;
  await assert.rejects(claim()); assertions++;
  await assert.rejects(db.query('select public.reserve_email_reminder($1,$2)',[alice,a])); assertions++;
  await db.exec('reset role');
  let jobs=await claim(); eq(jobs.length,1); eq(jobs[0].payload.to,['alice@example.test']);
  eq(await active(jobs[0]),true); eq((await claim()).length,0); // overlapping cron lease
  await set(a,false,[]); eq(await active(jobs[0]),true); // second device still enrolled
  await set(b,false,[]); eq(await active(jobs[0]),false);
  await set(a,true); await set(a,true,[]); eq(await active(jobs[0]),false); // review/delete/cancel
  await set(a,true); // retry keeps immutable payload/id
  await db.query("update public.email_reminder_deliveries set lease_until=now()-interval '1 second'");
  let retry=(await claim())[0]; eq(retry.id,jobs[0].id); eq(retry.payload,jobs[0].payload);
  eq(await complete(retry,true),false); // cannot acknowledge a delivery that was never reserved
  eq(await reserve(retry),retry.payload);
  eq(await reserve(retry),null); // never dispatch twice, even before completion
  eq(await complete(retry,true),true);
  eq(await complete(retry,true),true); // lost completion response is safe to retry
  eq(await complete(retry,false),false); // do not overwrite success with a later error
  eq((await claim()).length,0); // successful sends never repeat
  await set(a,true,[{id:'log-a',remindAt:new Date(Date.parse(due)+1000).toISOString()}]);
  jobs=await claim(); eq(jobs.length,1); // changed time is a distinct schedule
  eq(await reserve(jobs[0]),jobs[0].payload);
  await db.query("update public.email_reminder_deliveries set lease_until=null where sent_at is null");
  eq((await claim()).length,0); eq(await active(jobs[0]),false); // interrupted MailApp send is never retried
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);
  eq((await db.query('select public.get_email_reminder_setting($1) as on',[a])).rows[0].on,false);
  await set(a,true); jobs=await claim(); eq(jobs.length,1); eq(jobs[0].payload.to,['bob@example.test']);
  await db.query("update auth.users set email='changed@example.test' where id=$1",[bob]);
  eq(await active(jobs[0]),false); // do not send to old addresses
  await db.query("update auth.users set email_confirmed_at=null where id=$1",[bob]);
  await assert.rejects(set(a,true)); assertions++;
  await set(a,false,[]); // can stop without a verified address
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(set(a,true)); assertions++;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
  await assert.rejects(set(a,true,[{id:'broken'}])); assertions++;
  await assert.rejects(set(a,true,[{id:'broken',remindAt:'infinity'}])); assertions++;
  await assert.rejects(set(a,true,[{id:'long-title',remindAt:due,title:'x'.repeat(61)}])); assertions++;
  await assert.rejects(set(a,true,[{id:'bad-title',remindAt:due,title:{text:'invalid'}}])); assertions++;
  await set(b,false,[]);
  await set(a,true,[{id:'titled-log',remindAt:due,title:'転職\nするか'}]);
  jobs=await claim();
  const titled=jobs.find(job=>job.log_id==='titled-log');
  eq(titled.payload.subject,'DECIDE.｜「転職 するか」を振り返ってみませんか？');
  eq(titled.payload.text.includes('「転職 するか」を振り返る日に設定していました。'),true);
  eq(titled.payload.text.includes('まだ動けていない'),true);
  eq(titled.payload.text.includes('DECIDE.を開いて'),true);
  eq(titled.payload.text.includes('このメールは、DECIDE.で'),true);
  eq(/DECIDE(?!\.)/.test(titled.payload.text),false);
  await set(a,true,[{id:'legacy-log',remindAt:due}]);
  jobs=await claim();
  eq(jobs.find(job=>job.log_id==='legacy-log').payload.subject,'DECIDE.｜記録した決定を振り返ってみませんか？');
  // Stop link: works without the registered device, stops every device, and only an explicit request with the token counts.
  const link=titled.payload.text.match(/\nhttps:\/\/example\.test\/unsubscribe\?t=([0-9a-f-]{36})\n/);
  eq(Boolean(link),true);
  eq(titled.payload.text.includes('登録した端末の設定で'),false);
  await set(a,true,[{id:'stop-log',remindAt:due}]); await set(b,true,[{id:'stop-log-b',remindAt:due}]);
  const queued=(await claim()).find(job=>job.log_id==='stop-log');
  eq(Boolean(queued),true);
  await db.exec('set role anon');
  eq((await db.query('select public.email_unsubscribe($1) as ok',['20000000-0000-4000-8000-000000000009'])).rows[0].ok,false);
  await assert.rejects(db.query('select * from public.email_unsubscribe_tokens')); assertions++;
  await assert.rejects(db.query('select public.disable_all_email_reminders()')); assertions++;
  eq((await db.query('select public.email_unsubscribe($1) as ok',[link[1]])).rows[0].ok,true);
  await db.exec('reset role');
  eq(await active(queued),false); // already-queued mail is not sent after stopping
  for(const device of [a,b]) eq((await db.query('select public.get_email_reminder_setting($1) as on',[device])).rows[0].on,false);
  eq(Number((await db.query('select count(*) from public.email_reminders where user_id=$1',[alice])).rows[0].count),0);
  eq((await claim()).length,0);
  // Settings button: the signed-in account stops every device too.
  await set(a,true,[{id:'stop-again',remindAt:due}]); await set(b,true,[{id:'stop-again-b',remindAt:due}]);
  await db.exec('set role authenticated'); await db.query('select public.disable_all_email_reminders()'); await db.exec('reset role');
  for(const device of [a,b]) eq((await db.query('select public.get_email_reminder_setting($1) as on',[device])).rows[0].on,false);
  eq(Number((await db.query('select count(*) from public.email_reminders where user_id=$1',[alice])).rows[0].count),0);
  await db.query('delete from auth.users where id=$1',[alice]);
  eq(Number((await db.query('select count(*) from public.email_reminders where user_id=$1',[alice])).rows[0].count),0);
  eq(Number((await db.query('select count(*) from public.email_reminder_deliveries where user_id=$1',[alice])).rows[0].count),0);
  eq(Number((await db.query('select count(*) from public.email_unsubscribe_tokens where user_id=$1',[alice])).rows[0].count),0);
  console.log(`EMAIL_DATABASE_OK (${assertions} assertions: privileges, account isolation, verified recipients, leases, retries, cancellation, deduplication, stop link, cascade)`);
} finally { await db.close(); }

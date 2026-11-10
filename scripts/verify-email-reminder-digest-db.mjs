// Usage: npm install --prefix /tmp/decide-email-validation @electric-sql/pglite
// node scripts/verify-email-reminder-digest-db.mjs /tmp/decide-email-validation/node_modules/@electric-sql/pglite/dist/index.js
// Runs the real migrations INCLUDING the evening-digest migration in disposable PostgreSQL;
// never connects to production. The legacy safety scenarios of verify-email-reminders-db.mjs
// are re-run here against digest deliveries (a due schedule now surfaces at its evening),
// plus the migration cleanup and the digest patterns A / B / C / C' / D.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const alice='00000000-0000-4000-8000-000000000001', bob='00000000-0000-4000-8000-000000000002',
      carol='00000000-0000-4000-8000-000000000003', dave='00000000-0000-4000-8000-000000000004',
      erin='00000000-0000-4000-8000-000000000005';
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002',
      c='10000000-0000-4000-8000-000000000003', dv='10000000-0000-4000-8000-000000000004',
      er='10000000-0000-4000-8000-000000000005';
let assertions=0;
const eq=(actual,expected)=>{ assert.deepEqual(actual,expected); assertions++; };
const ok=(value,message)=>{ assert.ok(value,message); assertions++; };
// Instant of (today in Asia/Tokyo minus `days` days) at `hour`:00 JST, as an ISO string.
const jst=(days,hour)=>{ const j=new Date(Date.now()+9*3600e3); j.setUTCDate(j.getUTCDate()-days); j.setUTCHours(hour,0,0,0); return new Date(j.getTime()-9*3600e3).toISOString(); };
const mig=name=>fs.readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  for(const name of ['20261016000000_email_reminders.sql','20261016010000_reminder_title_copy.sql','20261022000000_reminder_brand_dot.sql','20261023000000_email_unsubscribe.sql'])
    await db.exec(mig(name));
  await db.query('insert into auth.users values ($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,now()),($9,$10,now())',
    [alice,'alice@example.test',bob,'bob@example.test',carol,'carol@example.test',dave,'dave@example.test',erin,'erin@example.test']);
  const asUser=uid=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const set=(device,on,items=[])=>db.query('select public.set_email_reminders($1,$2,$3)',[device,on,JSON.stringify(items)]);
  const claim=async()=> (await db.query('select * from public.claim_email_reminders($1,$2)',['DECIDE <remind@example.test>','https://example.test'])).rows;
  const active=async job=>(await db.query('select public.email_reminder_is_active($1,$2) as ok',[job.id,job.lease_token])).rows[0].ok;
  const reserve=async job=>(await db.query('select public.reserve_email_reminder($1,$2) as payload',[job.id,job.lease_token])).rows[0].payload;
  const complete=async(job,accepted)=>(await db.query('select public.complete_email_reminder($1,$2,$3) as ok',[job.id,job.lease_token,accepted])).rows[0].ok;
  const itemsOf=async id=>(await db.query('select * from public.email_reminder_delivery_items where delivery_id=$1 order by remind_at, log_id',[id])).rows;
  const forUser=(jobs,email)=>jobs.filter(job=>job.payload?.to?.[0]===email);
  const expireLease=id=>db.query("update public.email_reminder_deliveries set lease_until=now()-interval '1 second' where id=$1",[id]);

  // ---------- Phase M: in-flight legacy deliveries at migration time ----------
  const mAt=jst(2,10);
  await asUser(carol);
  await set(c,true,[{id:'old-plain',remindAt:mAt,title:'移行テスト'},{id:'old-sent',remindAt:mAt},{id:'old-reserved',remindAt:mAt}]);
  const legacyPayload=JSON.stringify({from:'DECIDE <remind@example.test>',to:['carol@example.test'],subject:'旧形式',text:'旧形式'});
  await db.query("insert into public.email_reminder_deliveries (user_id, log_id, remind_at, payload, sent_at) values ($1,'old-sent',$2,$3,now())",[carol,mAt,legacyPayload]);
  await db.query("insert into public.email_reminder_deliveries (user_id, log_id, remind_at, payload, dispatch_started_at) values ($1,'old-reserved',$2,$3,now())",[carol,mAt,legacyPayload]);
  await db.query("insert into public.email_reminder_deliveries (user_id, log_id, remind_at, payload) values ($1,'old-plain',$2,$3)",[carol,mAt,legacyPayload]);
  await db.exec(mig('20261110000000_email_reminder_digest.sql'));
  eq(Number((await db.query("select count(*) from public.email_reminder_deliveries where user_id=$1 and log_id='old-plain'",[carol])).rows[0].count),0); // never attempted: dropped, re-bundled below
  eq(Number((await db.query("select count(*) from public.email_reminder_deliveries where user_id=$1 and log_id='old-sent'",[carol])).rows[0].count),1); // sent: ledger stays
  eq(Number((await db.query("select count(*) from public.email_reminder_deliveries where user_id=$1 and log_id='old-reserved'",[carol])).rows[0].count),1); // ambiguous: stays, never resent
  let jobs=await claim(); eq(jobs.length,1); // only carol has anything due
  const carolDigest=jobs[0];
  eq(carolDigest.log_id,''); ok(carolDigest.digest_at,'digest carries digest_at');
  eq(Date.parse(carolDigest.digest_at),Date.parse(jst(2,19)));
  const carolItems=await itemsOf(carolDigest.id); eq(carolItems.length,1); eq(carolItems[0].log_id,'old-plain'); // sent/reserved schedules do NOT join the digest
  eq(carolDigest.payload.subject,'DECIDE.｜「移行テスト」を振り返ってみませんか？');
  ok((await reserve(carolDigest))?.subject?.includes('移行テスト'),'carol digest reservable');
  eq(await complete(carolDigest,true),true);
  eq((await claim()).length,0);

  // ---------- Phase L: legacy safety scenarios, digest edition ----------
  const due=jst(1,10), due2=jst(2,10), due3=jst(3,10); // due3: a fresh evening — the due evening's digest is already sent below
  const snap=[{id:'log-a',remindAt:due}];
  await asUser(alice);
  eq((await db.query('select public.get_email_reminder_setting($1) as on',[a])).rows[0].on,false);
  await db.exec('set role authenticated');
  await set(a,true,snap); await set(b,true,snap);
  await assert.rejects(db.query('select * from public.email_reminders')); assertions++;
  await assert.rejects(claim()); assertions++;
  await assert.rejects(db.query('select public.reserve_email_reminder($1,$2)',[alice,a])); assertions++;
  await db.exec('reset role');
  jobs=await claim(); eq(jobs.length,1);
  let job=jobs[0];
  eq(job.log_id,''); eq(Date.parse(job.digest_at),Date.parse(jst(1,19)));
  eq(job.payload.to,['alice@example.test']);
  eq(job.payload.subject,'DECIDE.｜記録した決定を振り返ってみませんか？'); // one untitled member: pattern A
  eq((await itemsOf(job.id)).length,1); // two devices, one schedule, one member
  eq(await active(job),true); eq((await claim()).length,0); // overlapping cron lease
  await set(a,false,[]); eq(await active(job),true); // second device still enrolled
  await set(b,false,[]); eq(await active(job),false);
  await set(a,true,snap); await set(a,true,[]); eq(await active(job),false); // review/delete/cancel
  await set(a,true,snap); // re-register: the same pending digest is reused
  await expireLease(job.id);
  let retry=(await claim())[0]; eq(retry.id,job.id); eq(retry.payload,job.payload);
  eq(await complete(retry,true),false); // cannot acknowledge a delivery that was never reserved
  eq(await reserve(retry),retry.payload);
  eq(await reserve(retry),null); // never dispatch twice, even before completion
  eq(await complete(retry,true),true);
  eq(await complete(retry,true),true); // lost completion response is safe to retry
  eq(await complete(retry,false),false); // do not overwrite success with a later error
  eq((await claim()).length,0); // successful sends never repeat
  await set(a,true,[{id:'log-a',remindAt:due2}]);
  jobs=await claim(); eq(jobs.length,1); // changed time is a distinct schedule (another evening)
  const job2=jobs[0]; eq(Date.parse(job2.digest_at),Date.parse(jst(2,19)));
  ok(await reserve(job2),'second evening reservable');
  await db.query("update public.email_reminder_deliveries set lease_until=null where sent_at is null");
  eq((await claim()).length,0); eq(await active(job2),false); // interrupted MailApp send is never retried
  await asUser(bob);
  eq((await db.query('select public.get_email_reminder_setting($1) as on',[a])).rows[0].on,false);
  await set(a,true,[{id:'bob-log',remindAt:due}]); jobs=await claim(); eq(jobs.length,1); eq(jobs[0].payload.to,['bob@example.test']);
  const bobJob=jobs[0];
  await db.query("update auth.users set email='changed@example.test' where id=$1",[bob]);
  eq(await active(bobJob),false); // do not send to old addresses
  await db.query("update auth.users set email_confirmed_at=null where id=$1",[bob]);
  await assert.rejects(set(a,true)); assertions++;
  await set(a,false,[]); // can stop without a verified address
  await asUser('');
  await assert.rejects(set(a,true)); assertions++;
  await asUser(alice);
  await assert.rejects(set(a,true,[{id:'broken'}])); assertions++;
  await assert.rejects(set(a,true,[{id:'broken',remindAt:'infinity'}])); assertions++;
  await assert.rejects(set(a,true,[{id:'long-title',remindAt:due,title:'x'.repeat(61)}])); assertions++;
  await assert.rejects(set(a,true,[{id:'bad-title',remindAt:due,title:{text:'invalid'}}])); assertions++;
  await assert.rejects(set(a,true,[{id:'dup',remindAt:due},{id:'dup',remindAt:due}])); assertions++;
  await set(a,true,[{id:'titled-log',remindAt:due3,title:'転職\nするか'}]);
  jobs=await claim();
  const titled=forUser(jobs,'alice@example.test').find(j=>j.payload.text.includes('転職 するか'));
  ok(titled,'titled digest claimed');
  eq((await itemsOf(titled.id)).length,1);
  eq(titled.payload.subject,'DECIDE.｜「転職 するか」を振り返ってみませんか？');
  eq(titled.payload.text.includes('「転職 するか」を振り返る日に設定していました。'),true);
  eq(titled.payload.text.includes('まだ動けていない'),true);
  eq(titled.payload.text.includes('DECIDE.を開いて'),true);
  eq(titled.payload.text.includes('このメールは、DECIDE.で'),true);
  eq(titled.payload.text.includes('/unsubscribe?t='),true);
  eq(/DECIDE(?!\.)/.test(titled.payload.text),false);
  await set(a,true,[{id:'legacy-log',remindAt:due3}]);
  await expireLease(titled.id);
  jobs=await claim();
  const merged=forUser(jobs,'alice@example.test').find(j=>j.id===titled.id);
  ok(merged,'a later schedule for the same evening joins the pending digest');
  eq((await itemsOf(merged.id)).length,2);
  eq(merged.payload.subject,'DECIDE.｜今日のふり返りが2件あります');
  eq(merged.payload.text.includes('・「転職 するか」'),true);
  eq(merged.payload.text.includes('・「記録した決定」'),true);
  // Stop link: works without the registered device, stops every device, and only an explicit request with the token counts.
  const link=titled.payload.text.match(/\nhttps:\/\/example\.test\/unsubscribe\?t=([0-9a-f-]{36})\n/);
  eq(Boolean(link),true);
  await set(a,true,[{id:'stop-log',remindAt:due3,title:'stop-log'}]); await set(b,true,[{id:'stop-log-b',remindAt:due3,title:'stop-log-b'}]);
  await expireLease(merged.id);
  const queued=forUser(await claim(),'alice@example.test').find(j=>j.payload.text.includes('「stop-log」'));
  ok(queued,'stop-log digest claimed');
  eq(queued.id,titled.id); // every schedule of that evening is in the one digest
  eq((await itemsOf(queued.id)).length,4);
  eq(queued.payload.text.includes('「stop-log-b」'),true);
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
  await set(a,true,[{id:'stop-again',remindAt:due3}]); await set(b,true,[{id:'stop-again-b',remindAt:due3}]);
  await db.exec('set role authenticated'); await db.query('select public.disable_all_email_reminders()'); await db.exec('reset role');
  for(const device of [a,b]) eq((await db.query('select public.get_email_reminder_setting($1) as on',[device])).rows[0].on,false);
  eq(Number((await db.query('select count(*) from public.email_reminders where user_id=$1',[alice])).rows[0].count),0);
  await db.query('delete from auth.users where id=$1',[alice]);
  eq(Number((await db.query('select count(*) from public.email_reminders where user_id=$1',[alice])).rows[0].count),0);
  eq(Number((await db.query('select count(*) from public.email_reminder_deliveries where user_id=$1',[alice])).rows[0].count),0);
  eq(Number((await db.query('select count(*) from public.email_reminder_delivery_items where user_id=$1',[alice])).rows[0].count),0);
  eq(Number((await db.query('select count(*) from public.email_unsubscribe_tokens where user_id=$1',[alice])).rows[0].count),0);

  // ---------- Phase D: digest bundling, patterns C / B / C' and reserve-time pruning ----------
  await asUser(dave);
  await set(dv,true,[
    {id:'kaimono',remindAt:jst(1,9),title:'買い物'},
    {id:'tenshoku',remindAt:jst(1,12),title:'転職'},
    {id:'undou',remindAt:jst(1,18),title:'運動'}]);
  jobs=forUser(await claim(),'dave@example.test'); eq(jobs.length,1); // (a) one email for the whole evening
  let digA=jobs[0];
  eq(Date.parse(digA.digest_at),Date.parse(jst(1,19)));
  eq((await itemsOf(digA.id)).length,3);
  eq(digA.payload.subject,'DECIDE.｜今日のふり返りが3件あります'); // pattern C
  eq(digA.payload.text.includes('今日も一日、おつかれさまでした。'),true);
  eq(digA.payload.text.includes('・「買い物」'),true);
  eq(digA.payload.text.includes('・「転職」'),true);
  eq(digA.payload.text.includes('・「運動」'),true);
  eq(digA.payload.text.includes('全部でなくても、気になるものから1つだけでも'),true);
  eq(digA.payload.text.includes('時間をかけるつもりだった決断は'),false); // no long member, no C' line
  eq(digA.payload.text.includes('前に一度お知らせした決断も含まれています'),false); // no repeat member
  eq(forUser(await claim(),'dave@example.test').length,0); // (e) leased: not handed out twice
  await expireLease(digA.id);
  jobs=forUser(await claim(),'dave@example.test'); eq(jobs.length,1); eq(jobs[0].id,digA.id); // same digest, never a second one
  eq((await itemsOf(digA.id)).length,3); // and no member is bundled twice
  eq(Number((await db.query("select count(*) from public.email_reminder_deliveries where user_id=$1 and digest_at is not null",[dave])).rows[0].count),1);
  digA=jobs[0];
  await set(dv,true,[ // (d) one member was looked back (removed) after the claim
    {id:'kaimono',remindAt:jst(1,9),title:'買い物'},
    {id:'tenshoku',remindAt:jst(1,12),title:'転職'}]);
  const pruned=await reserve(digA);
  eq(pruned.subject,'DECIDE.｜今日のふり返りが2件あります'); // text rebuilt from what remains
  eq(pruned.text.includes('「運動」'),false);
  eq(pruned.text.includes('「買い物」'),true);
  eq((await itemsOf(digA.id)).length,2);
  eq(await complete(digA,true),true);
  await set(dv,true,[{id:'solo',remindAt:jst(2,10),title:'単独'}]);
  const digSolo=forUser(await claim(),'dave@example.test')[0];
  eq(digSolo.payload.subject,'DECIDE.｜「単独」を振り返ってみませんか？'); // (b) a single member keeps pattern A
  await set(dv,true,[]); // (d) the only member is cancelled before the send
  eq(await reserve(digSolo),null);
  eq(await active(digSolo),false);
  ok((await db.query('select failed_at from public.email_reminder_deliveries where id=$1',[digSolo.id])).rows[0].failed_at,'empty digest is closed unsent');
  eq(forUser(await claim(),'dave@example.test').length,0);
  await set(dv,true,[{id:'long-log',remindAt:jst(3,15),title:'副業'}]);
  await db.query("update public.email_reminders set registered_at = remind_at - interval '10 days' where user_id=$1 and log_id='long-log'",[dave]);
  const digB=forUser(await claim(),'dave@example.test')[0];
  eq(digB.payload.subject,'DECIDE.｜「副業」、その後どうですか？'); // pattern B: planned far ahead
  eq(digB.payload.text.includes('少し先のふり返りに設定していました'),true);
  eq(digB.payload.text.includes('途中の実感も今の記録になります'),true);
  ok(await reserve(digB),'pattern B reservable'); eq(await complete(digB,true),true);
  await set(dv,true,[
    {id:'short-log',remindAt:jst(4,10),title:'短期'},
    {id:'long2-log',remindAt:jst(4,11),title:'長期'}]);
  await db.query("update public.email_reminders set registered_at = remind_at - interval '12 days' where user_id=$1 and log_id='long2-log'",[dave]);
  const digC=forUser(await claim(),'dave@example.test')[0];
  eq(digC.payload.subject,'DECIDE.｜今日のふり返りが2件あります');
  eq(digC.payload.text.includes('時間をかけるつもりだった決断は、結果がまだ先でも、途中の実感を残せます。'),true); // C' line for a long member
  ok(await reserve(digC),'pattern C reservable'); eq(await complete(digC,true),true);

  // ---------- Phase R: pattern D (same decision mailed before) ----------
  await asUser(erin);
  await set(er,true,[{id:'rep-log',remindAt:jst(2,10),title:'繰り返し題'}]);
  const digR1=forUser(await claim(),'erin@example.test')[0];
  eq(digR1.payload.subject,'DECIDE.｜「繰り返し題」を振り返ってみませんか？'); // first time: pattern A
  ok(await reserve(digR1),'first send reservable'); eq(await complete(digR1,true),true);
  await set(er,true,[{id:'rep-log',remindAt:jst(1,10),title:'繰り返し題'}]); // same decision, a new day chosen
  const digR2=forUser(await claim(),'erin@example.test')[0];
  eq((await itemsOf(digR2.id)).length,1);
  eq(digR2.payload.subject,'DECIDE.｜「繰り返し題」のふり返りが残っています'); // pattern D
  eq(digR2.payload.text.includes('前に一度お知らせした決断です'),true);
  eq(digR2.payload.text.includes('日を外してください'),true);
  eq(digR2.payload.text.includes('まだ動けていない」も今の記録になります'),true);
  ok(await reserve(digR2),'pattern D reservable'); eq(await complete(digR2,true),true);
  await set(er,true,[
    {id:'rep-log',remindAt:jst(3,10),title:'繰り返し題'},
    {id:'fresh-log',remindAt:jst(3,12),title:'新規'}]);
  const digR3=forUser(await claim(),'erin@example.test')[0];
  eq(digR3.payload.subject,'DECIDE.｜今日のふり返りが2件あります'); // several members win over D…
  eq(digR3.payload.text.includes('この中に、前に一度お知らせした決断も含まれています。気が向いたものからで大丈夫です。'),true); // …with the D note line
  ok(await reserve(digR3),'mixed digest reservable'); eq(await complete(digR3,true),true);

  console.log(`EMAIL_DIGEST_DATABASE_OK (${assertions} assertions: migration cleanup, privileges, account isolation, verified recipients, leases, retries, cancellation, deduplication, stop link, cascade, digest bundling, reserve-time pruning, patterns A/B/C/C'/D)`);
} finally { await db.close(); }

// Usage: npm install --prefix /tmp/decide-email-validation @electric-sql/pglite
// node scripts/verify-email-reminder-lang-db.mjs /tmp/decide-email-validation/node_modules/@electric-sql/pglite/dist/index.js
// Runs the real migrations INCLUDING the lang migration (20261115000000) in disposable
// PostgreSQL; never connects to production. Proves: (1) Japanese payloads are byte-identical
// before/after the lang migration, (2) English payloads for patterns A/B/C/D + footer,
// (3) lang sync semantics of the 4-argument set_email_reminders and claim-time resolution.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const frank='00000000-0000-4000-8000-000000000011', grace='00000000-0000-4000-8000-000000000012',
      heidi='00000000-0000-4000-8000-000000000013', ivan='00000000-0000-4000-8000-000000000014';
const fa='10000000-0000-4000-8000-000000000011', gr='10000000-0000-4000-8000-000000000012',
      h1='10000000-0000-4000-8000-000000000013', h2='10000000-0000-4000-8000-000000000014',
      iv='10000000-0000-4000-8000-000000000015';
const token='20000000-0000-4000-8000-000000000001';
let assertions=0;
const eq=(actual,expected)=>{ assert.deepEqual(actual,expected); assertions++; };
const ok=(value,message)=>{ assert.ok(value,message); assertions++; };
const jst=(days,hour)=>{ const j=new Date(Date.now()+9*3600e3); j.setUTCDate(j.getUTCDate()-days); j.setUTCHours(hour,0,0,0); return new Date(j.getTime()-9*3600e3).toISOString(); };
const mig=name=>fs.readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const SENDER='DECIDE <remind@example.test>', SITE='https://example.test';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  for(const name of ['20261016000000_email_reminders.sql','20261016010000_reminder_title_copy.sql','20261022000000_reminder_brand_dot.sql','20261023000000_email_unsubscribe.sql','20261110000000_email_reminder_digest.sql'])
    await db.exec(mig(name));
  await db.query('insert into auth.users values ($1,$2,now()),($3,$4,now()),($5,$6,now()),($7,$8,now())',
    [frank,'frank@example.test',grace,'grace@example.test',heidi,'heidi@example.test',ivan,'ivan@example.test']);
  const payload5=async items=>(await db.query('select public.email_reminder_digest_payload_($1,$2,$3,$4,$5::jsonb) as p',[SENDER,SITE,'someone@example.test',token,JSON.stringify(items)])).rows[0].p;
  const payload6=async(items,lang)=>(await db.query('select public.email_reminder_digest_payload_($1,$2,$3,$4,$5::jsonb,$6) as p',[SENDER,SITE,'someone@example.test',token,JSON.stringify(items),lang])).rows[0].p;

  // ---------- Phase 1: capture Japanese payloads BEFORE the lang migration ----------
  const cases={
    A_titled:[{title:'転職',long:false,repeat:false}],
    A_untitled:[{title:'',long:false,repeat:false}],
    B:[{title:'副業',long:true,repeat:false}],
    D:[{title:'繰り返し題',long:false,repeat:true}],
    C:[{title:'買い物',long:false,repeat:false},{title:'運動',long:false,repeat:false}],
    C_long:[{title:'短期',long:false,repeat:false},{title:'長期',long:true,repeat:false}],
    C_repeat:[{title:'繰り返し題',long:false,repeat:true},{title:'新規',long:false,repeat:false}],
    C_untitled:[{title:'',long:false,repeat:false},{title:'運動',long:false,repeat:false}],
  };
  const jaBefore={};
  for(const [name,items] of Object.entries(cases)) jaBefore[name]=JSON.stringify(await payload5(items));

  await db.exec(mig('20261115000000_email_reminder_lang.sql'));

  // ---------- Phase 2: Japanese payloads are byte-identical AFTER ----------
  for(const [name,items] of Object.entries(cases)) {
    eq(JSON.stringify(await payload5(items)),jaBefore[name]); // original function untouched
    eq(JSON.stringify(await payload6(items,'ja')),jaBefore[name]); // overload delegates for ja
    eq(JSON.stringify(await payload6(items,null)),jaBefore[name]); // and for null
  }

  // ---------- Phase 3: English payloads, all patterns + footer ----------
  const enA=await payload6(cases.A_titled,'en');
  eq(enA.subject,'DECIDE. | Look back on "転職"?'); // the user's own title is never translated
  ok(enA.text.startsWith('You set today as the day to look back on "転職".'),'en A opening');
  ok(enA.text.includes('Has how you feel changed since you decided?'),'en A body');
  const enA0=await payload6(cases.A_untitled,'en');
  eq(enA0.subject,'DECIDE. | Look back on a decision you recorded?');
  ok(enA0.text.startsWith('You set today as the day to look back on a decision you recorded.'),'en A untitled opening');
  const enB=await payload6(cases.B,'en');
  eq(enB.subject,'DECIDE. | "副業" — how has it gone since then?');
  ok(enB.text.includes('to look back on a little further ahead'),'en B body');
  ok(enB.text.includes('how it feels partway through is also a record'),'en B body 2');
  const enD=await payload6(cases.D,'en');
  eq(enD.subject,'DECIDE. | A look-back is still waiting for "繰り返し題"');
  ok(enD.text.includes('we reminded you about once before'),'en D body');
  ok(enD.text.includes('or remove the day'),'en D body 2');
  const enC=await payload6(cases.C,'en');
  eq(enC.subject,'DECIDE. | You have 2 decisions to look back on today');
  ok(enC.text.includes('• "買い物"'),'en C bullet 1');
  ok(enC.text.includes('• "運動"'),'en C bullet 2');
  eq(enC.text.includes('planned to take time with'),false); // no long member, no extra line
  eq(enC.text.includes('reminded you about once before. Start with whichever'),false); // no repeat member
  const enCL=await payload6(cases.C_long,'en');
  ok(enCL.text.includes('For a decision you planned to take time with, you can record how it feels partway through'),'en C long line');
  const enCR=await payload6(cases.C_repeat,'en');
  ok(enCR.text.includes('This includes a decision we reminded you about once before. Start with whichever you like.'),'en C repeat line');
  const enCU=await payload6(cases.C_untitled,'en');
  ok(enCU.text.includes('• "a recorded decision"'),'en C untitled fallback');
  for(const p of [enA,enB,enD,enC]) {
    ok(p.text.includes('You\'re receiving this email because you turned on "Email reminders" in DECIDE.'),'en footer line 1');
    ok(p.text.includes('Stop reminder emails (all devices):\n'+SITE+'/unsubscribe?t='+token),'en footer stop link');
    ok(p.text.includes('You can also stop them from the "Email reminders" setting in the app.'),'en footer line 3');
    eq(p.from,SENDER); eq(p.to,['someone@example.test']); eq(p.site,SITE); // payload shape unchanged
    eq(/[぀-ヿ]/.test(p.text.replace(/転職|副業|繰り返し題|買い物|運動/g,'')),false); // no Japanese outside user titles
  }

  // ---------- Phase 4: lang sync + claim-time resolution ----------
  const asUser=uid=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const set3=(device,on,items=[])=>db.query('select public.set_email_reminders($1,$2,$3)',[device,on,JSON.stringify(items)]);
  const set4=(device,on,items=[],lang=null)=>db.query('select public.set_email_reminders($1,$2,$3,$4)',[device,on,JSON.stringify(items),lang]);
  const claim=async()=> (await db.query('select * from public.claim_email_reminders($1,$2)',[SENDER,SITE])).rows;
  const forUser=(jobs,email)=>jobs.filter(job=>job.payload?.to?.[0]===email);
  const deviceLang=async(device,uid)=>(await db.query('select lang from public.email_reminder_devices where user_id=$1 and device_id=$2',[uid,device])).rows[0].lang;
  const userLang=async uid=>(await db.query('select public.email_reminder_user_lang_($1) as lang',[uid])).rows[0].lang;

  // frank: English device -> English digest end to end.
  await asUser(frank);
  await set4(fa,true,[{id:'f-log',remindAt:jst(1,10),title:'転職'}],'en');
  eq(await deviceLang(fa,frank),'en');
  eq(await userLang(frank),'en');
  let jobs=forUser(await claim(),'frank@example.test'); eq(jobs.length,1);
  eq(jobs[0].payload.subject,'DECIDE. | Look back on "転職"?');
  ok(jobs[0].payload.text.includes('"Email reminders" setting in the app'),'frank digest footer is English');
  // The old 3-argument RPC (old app) must not clobber the stored language.
  await set3(fa,true,[{id:'f-log',remindAt:jst(1,10),title:'転職'}]);
  eq(await deviceLang(fa,frank),'en');
  // A null lang in the 4-argument RPC keeps the stored value too.
  await set4(fa,true,[{id:'f-log',remindAt:jst(1,10),title:'転職'}],null);
  eq(await deviceLang(fa,frank),'en');
  // Garbage lang is rejected.
  await assert.rejects(set4(fa,true,[],'fr')); assertions++;

  // grace: Japanese stays Japanese, and the claimed payload equals the original builder's output.
  await asUser(grace);
  await set4(gr,true,[{id:'g-log',remindAt:jst(1,11),title:'買い物'}],'ja');
  jobs=forUser(await claim(),'grace@example.test'); eq(jobs.length,1);
  const gItems=(await db.query('select public.email_reminder_digest_items_($1) as items',[jobs[0].id])).rows[0].items;
  const gToken=(await db.query('select token from public.email_unsubscribe_tokens where user_id=$1',[grace])).rows[0].token;
  const gExpected=(await db.query('select public.email_reminder_digest_payload_($1,$2,$3,$4,$5::jsonb) as p',[SENDER,SITE,'grace@example.test',gToken,JSON.stringify(gItems)])).rows[0].p;
  eq(jobs[0].payload,gExpected); // claim path produces the untouched Japanese builder's payload

  // heidi: two devices — the most recently synced enabled device decides.
  await asUser(heidi);
  await set4(h1,true,[{id:'h-log',remindAt:jst(2,10),title:'題名'}],'en');
  await set4(h2,true,[{id:'h-log',remindAt:jst(2,10),title:'題名'}],'ja'); // synced later -> wins
  eq(await userLang(heidi),'ja');
  jobs=forUser(await claim(),'heidi@example.test'); eq(jobs.length,1);
  ok(jobs[0].payload.subject.startsWith('DECIDE.｜'),'heidi evening 1 is Japanese');
  const reserve=async job=>(await db.query('select public.reserve_email_reminder($1,$2) as payload',[job.id,job.lease_token])).rows[0].payload;
  ok(await reserve(jobs[0]),'heidi digest reservable');
  eq((await db.query('select public.complete_email_reminder($1,$2,true) as ok',[jobs[0].id,jobs[0].lease_token])).rows[0].ok,true);
  await set4(h1,true,[{id:'h-log2',remindAt:jst(1,10),title:'題名'}],'en'); // phone syncs again -> now latest
  eq(await userLang(heidi),'en');
  jobs=forUser(await claim(),'heidi@example.test'); eq(jobs.length,1);
  eq(jobs[0].payload.subject,'DECIDE. | Look back on "題名"?');

  // ivan: reserve-time rebuild keeps English after a member drops out.
  await asUser(ivan);
  await set4(iv,true,[{id:'i-1',remindAt:jst(1,9),title:'One'},{id:'i-2',remindAt:jst(1,12),title:'Two'}],'en');
  jobs=forUser(await claim(),'ivan@example.test'); eq(jobs.length,1);
  eq(jobs[0].payload.subject,'DECIDE. | You have 2 decisions to look back on today');
  await set4(iv,true,[{id:'i-1',remindAt:jst(1,9),title:'One'}],'en'); // second decision was looked back
  const rebuilt=await reserve(jobs[0]);
  eq(rebuilt.subject,'DECIDE. | Look back on "One"?');
  ok(rebuilt.text.includes('You set today as the day'),'ivan rebuilt text is English');

  console.log(`EMAIL_LANG_DATABASE_OK (${assertions} assertions: ja byte-identity pre/post migration, en patterns A/B/C/D + footer, payload shape, 4-arg lang sync, 3-arg/null preservation, invalid lang rejection, latest-device resolution, reserve rebuild)`);
} finally { await db.close(); }

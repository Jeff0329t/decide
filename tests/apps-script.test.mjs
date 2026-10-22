import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
function load({enabled=true,quota=100,active=true,wrongSender=false,sendThrows=false,ackThrows=false,reserveThrows=false,gmail=null}={}) {
  const values={WORKER_URL:'https://ppuyenvuepxqqrhiswwb.supabase.co/functions/v1/send-email-reminders',WORKER_SECRET:'test-private-key',SENDER_EMAIL:'dedicated.sender@gmail.com',SEND_ENABLED:String(enabled)};
  const requests=[],sent=[],events=[];let reserved=false,unlocked=false;
  const scope={console:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>values[k],setProperty:(k,v)=>{values[k]=v;}})},
    Session:{getEffectiveUser:()=>({getEmail:()=>wrongSender?'other@gmail.com':values.SENDER_EMAIL})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{unlocked=true;}})},
    ...(gmail?{GmailApp:gmail}:{}),
    MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:payload=>{events.push('send');sent.push(payload);quota--;if(sendThrows)throw Error('ambiguous');}},
    UrlFetchApp:{fetch:(url,options)=>{
      const input=JSON.parse(options.payload);requests.push(input);events.push(input.action);
      assert.equal(options.headers['x-worker-secret'],'test-private-key');assert.equal(options.followRedirects,false);
      let data;
      if(input.action==='status')data={ok:true,enabled:true};
      if(input.action==='claim')data={jobs:[{id:'job',lease:'lease'}]};
      if(input.action==='reserve'){
        if(reserveThrows)throw Error('unknown reservation outcome');
        data={payload:active&&!reserved?{from:values.SENDER_EMAIL,to:['alice@example.test'],subject:'Review',text:'Fixed text'}:null};reserved=true;
      }
      if(input.action==='complete'){if(ackThrows)throw Error('ack lost');data={ok:true};}
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(data)};
    }}
  };
  vm.createContext(scope);vm.runInContext(code,scope);
  return {scope,requests,sent,events,unlocked:()=>unlocked};
}
test('disabled worker and exhausted quota neither claim nor send',()=>{
  for(const options of [{enabled:false},{quota:0}]){const h=load(options);h.scope.runReminders();assert.equal(h.requests.length,0);assert.equal(h.sent.length,0);}
});
test('connection check does not claim or send; wrong account is rejected',()=>{
  const h=load();h.scope.checkConnection();assert.deepEqual(h.requests.map(r=>r.action),['status']);assert.equal(h.sent.length,0);
  const wrong=load({wrongSender:true});assert.throws(()=>wrong.scope.runReminders(),/dedicated sending account/);assert.equal(wrong.requests.length,0);assert.ok(wrong.unlocked());
});
test('setup test sends only to the configured sender itself without claiming any jobs',()=>{
  const h=load({enabled:false});h.scope.sendTestEmail();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].to,'dedicated.sender@gmail.com');
  assert.deepEqual(h.requests.map(r=>r.action),['status']);
  const exhausted=load({quota:0});assert.throws(()=>exhausted.scope.sendTestEmail(),/quota exhausted/);assert.equal(exhausted.sent.length,0);
});
test('canonical message is sent only after reservation and then acknowledged',()=>{
  const h=load();h.scope.runReminders();assert.deepEqual(h.events,['claim','reserve','send','complete']);
  assert.equal(h.sent[0].to,'alice@example.test');assert.equal(h.sent[0].name,'DECIDE.');assert.equal(h.requests.at(-1).accepted,true);assert.ok(h.unlocked());
});
test('canceled and previously reserved deliveries never send',()=>{
  const h=load({active:false});h.scope.runReminders();assert.equal(h.sent.length,0);
  const repeated=load();repeated.scope.runReminders();repeated.scope.runReminders();assert.equal(repeated.sent.length,1);
});
test('ambiguous reservation response never causes a send',()=>{
  const h=load({reserveThrows:true});assert.throws(()=>h.scope.runReminders());assert.equal(h.sent.length,0);assert.ok(h.unlocked());
});
test('ambiguous MailApp error is recorded and not resent',()=>{
  const h=load({sendThrows:true});assert.throws(()=>h.scope.runReminders(),/require review/);assert.equal(h.requests.at(-1).accepted,false);
  h.scope.runReminders();assert.equal(h.sent.length,1);assert.ok(h.unlocked());
});
test('lost completion response retries only completion, never the email',()=>{
  const h=load({ackThrows:true});assert.throws(()=>h.scope.runReminders(),/require review/);
  assert.equal(h.requests.filter(r=>r.action==='complete').length,2);assert.equal(h.sent.length,1);
  h.scope.runReminders();assert.equal(h.sent.length,1);
});

// Sent copies hold every recipient's address and title: they go to Trash (deleted by Gmail after 30 days).
function mailbox(threads){
  const searches=[];
  const message=(from,subject)=>{const m={from,subject,trashed:false,getFrom:()=>from,getSubject:()=>subject,isInTrash:()=>m.trashed,moveToTrash:()=>{m.trashed=true;}};return m;};
  const list=threads.map(messages=>messages.map(([from,subject])=>message(from,subject)));
  return {searches,list,gmail:{search:(query,start,max)=>{searches.push({query,max});return list.filter(t=>t.some(m=>!m.trashed&&m.from.includes('dedicated.sender@gmail.com'))).slice(0,max).map(t=>({getMessages:()=>t}));}}};
}
test('after sending, only our own sent reminder copies move to Trash; replies stay',()=>{
  const box=mailbox([[['DECIDE. <dedicated.sender@gmail.com>','DECIDE.｜「転職」を振り返ってみませんか？'],['Alice <alice@example.test>','Re: DECIDE.｜「転職」を振り返ってみませんか？']],[['dedicated.sender@gmail.com','DECIDE.｜記録した決定を振り返ってみませんか？']]]);
  const h=load({gmail:box.gmail});h.scope.runReminders();
  assert.equal(h.sent.length,1);
  assert.deepEqual(box.list.map(t=>t.map(m=>m.trashed)),[[true,false],[true]]);
  assert.match(box.searches[0].query,/in:sent/);
});
test('a Trash failure never changes the delivery outcome or causes a resend',()=>{
  const h=load({gmail:{search:()=>{throw Error('gmail down');}}});h.scope.runReminders();
  assert.deepEqual(h.events,['claim','reserve','send','complete']);assert.equal(h.requests.at(-1).accepted,true);
  h.scope.runReminders();assert.equal(h.sent.length,1);
});
test('nothing sent means no mailbox access',()=>{
  const box=mailbox([]);const h=load({gmail:box.gmail,active:false});h.scope.runReminders();assert.equal(box.searches.length,0);
});
test('one-time purge clears earlier sent copies without claiming or sending',()=>{
  const box=mailbox(Array.from({length:150},(_,i)=>[['DECIDE. <dedicated.sender@gmail.com>',`DECIDE.｜「${i}」を振り返ってみませんか？`]]));
  const h=load({gmail:box.gmail});h.scope.purgeSentReminders();
  assert.equal(box.list.flat().filter(m=>!m.trashed).length,0);assert.equal(h.requests.length,0);assert.equal(h.sent.length,0);
});
test('manifest asks for the mailbox scope needed to trash sent copies',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../google-apps-script/appsscript.json',import.meta.url),'utf8'));
  assert.ok(manifest.oauthScopes.includes('https://mail.google.com/'));
});

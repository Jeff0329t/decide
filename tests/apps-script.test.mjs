import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
function load({enabled=true,quota=100,active=true,wrongSender=false,sendThrows=false,ackThrows=false,reserveThrows=false}={}) {
  const values={WORKER_URL:'https://ppuyenvuepxqqrhiswwb.supabase.co/functions/v1/send-email-reminders',WORKER_SECRET:'test-private-key',SENDER_EMAIL:'dedicated.sender@gmail.com',SEND_ENABLED:String(enabled)};
  const requests=[],sent=[],events=[];let reserved=false,unlocked=false;
  const scope={console:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>values[k],setProperty:(k,v)=>{values[k]=v;}})},
    Session:{getEffectiveUser:()=>({getEmail:()=>wrongSender?'other@gmail.com':values.SENDER_EMAIL})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{unlocked=true;}})},
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

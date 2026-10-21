import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/send-email-reminders/handler.mjs';
const id='00000000-0000-4000-8000-000000000001',lease='00000000-0000-4000-8000-000000000002';
function load({enabled='true',failure=false,payload={to:['recipient@example.test']},complete=true}={}) {
  const calls=[];
  const admin={rpc:async(name,args)=>{calls.push({name,args});return {error:failure,data:name==='claim_email_reminders'?[{id,lease_token:lease,payload}]:name==='reserve_email_reminder'?payload:complete};}};
  const handler=createHandler({admin,config:{enabled,secret:'private-worker-key',sender:'dedicated.sender@gmail.com',site:'https://example.test'}});
  return {calls,run:(input={},secret='private-worker-key')=>handler(new Request('https://example.test',{method:'POST',headers:{'x-worker-secret':secret},body:JSON.stringify({sender:'dedicated.sender@gmail.com',...input})}))};
}
test('only the private worker secret and configured sending account can access the gateway',async()=>{
  const h=load();assert.equal((await h.run({action:'claim'},'wrong')).status,401);
  assert.equal((await h.run({action:'claim',sender:'other@gmail.com'})).status,403);assert.equal(h.calls.length,0);
});
test('status is safe while disabled and does not claim or dispatch mail',async()=>{
  const h=load({enabled:'false'});assert.deepEqual(await (await h.run({action:'status'})).json(),{ok:true,enabled:false});
  assert.equal((await h.run({action:'claim'})).status,503);assert.equal(h.calls.length,0);
});
test('claim returns only server identifiers; server fixes the sender and site',async()=>{
  const h=load();assert.deepEqual(await (await h.run({action:'claim',senderOverride:'attacker@gmail.com'})).json(),{jobs:[{id,lease}]});
  assert.deepEqual(h.calls[0].args,{sender:'dedicated.sender@gmail.com',site_url:'https://example.test'});
});
test('canceled/disabled/already reserved deliveries cannot be sent',async()=>{
  const h=load({payload:null});assert.deepEqual(await(await h.run({action:'reserve',id,lease})).json(),{payload:null});
});
test('reservation returns canonical DB payload and never uses caller recipients/body',async()=>{
  const h=load();const result=await(await h.run({action:'reserve',id,lease,to:'attacker@example.test',body:'spam'})).json();
  assert.deepEqual(result.payload,{to:['recipient@example.test']});assert.deepEqual(h.calls[0].args,{delivery:id,lease});
});
test('DB failures and invalid input fail closed',async()=>{
  const h=load({failure:true});assert.equal((await h.run({action:'claim'})).status,500);
  const valid=load();assert.equal((await valid.run({action:'reserve',id:'bad',lease})).status,400);
  assert.equal((await valid.run({action:'complete',id,lease,accepted:'yes'})).status,400);assert.equal(valid.calls.length,0);
});
test('completion can be recorded while disabled; invalid lease/outcome is rejected',async()=>{
  const h=load({enabled:'false'});assert.deepEqual(await(await h.run({action:'complete',id,lease,accepted:true})).json(),{ok:true});
  const bad=load({complete:false});assert.equal((await bad.run({action:'complete',id,lease,accepted:true})).status,409);
});

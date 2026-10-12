import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const share=require('../dist/consultation-share.js');
const scope={globalThis:null,atob,escape,decodeURIComponent};scope.globalThis=scope;
vm.runInNewContext(fs.readFileSync(new URL('../dist/shared.js',import.meta.url),'utf8'),scope);
const shared=scope.DECIDE_SHARED;
const cards=[{id:'M17',name:'星',image:'./assets/rider-waite/ar17.jpg',orientation:'upright'},{id:'M0',name:'愚者',image:'./assets/rider-waite/ar00.jpg',orientation:'reversed'}];
const log={mode:'two',title:'PRIVATE TITLE',memo:'PRIVATE MEMO',story:'PRIVATE STORY',options:{'1':'今の仕事を続ける','2':'新しい仕事に挑戦する'},decision:'選択肢2'};
const decode=data=>JSON.parse(decodeURIComponent(escape(atob(share.link(data,'https://example.test/').split('#share=')[1]))));

test('consultation sends selected wording/cards but excludes private fields by default',()=>{
  const data=share.draft(log,cards),p=decode(data);
  assert.equal(p.a,2);assert.equal(p.d,'選択肢2');assert.equal(p.c[1][1],1);
  assert.deepEqual(p.q,[log.options['1'],log.options['2']]);
  const text=JSON.stringify(p)+share.postText(data);
  for(const secret of ['PRIVATE TITLE','PRIVATE MEMO','PRIVATE STORY'])assert.ok(!text.includes(secret));
  assert.equal(shared.validSharedPayload(p,new Set(['M17','M0'])),true);
});
test('share-only edits do not mutate original record and opt-in memo matches text and URL',()=>{
  const before=JSON.stringify(log),data=share.draft(log,cards);data.choices[0]='匿名A';data.question='どう思う？';data.includeMemo=true;
  const p=decode(data);assert.equal(p.q[0],'匿名A');assert.equal(p.t,'どう思う？');assert.equal(p.n,'PRIVATE MEMO');assert.match(share.postText(data),/PRIVATE MEMO/);
  assert.equal(JSON.stringify(log),before);
  data.includeMemo=false;assert.equal(decode(data).n,undefined);assert.doesNotMatch(share.postText(data),/PRIVATE MEMO/);
});
test('ambiguous old decisions never infer A/B, one-card sharing never invents second card',()=>{
  assert.equal(share.draft({...log,decision:'進む'},cards).chosen,0);
  const data=share.draft({...log,mode:'one',decision:'進む'},cards),p=decode(data);
  assert.equal(p.c.length,1);assert.deepEqual(p.q,[]);assert.equal(p.a,0);assert.equal(p.d,'進む');assert.doesNotMatch(share.postText(data),/新しい仕事|あなたなら、どっち/);
});
test('consultation reader rejects malformed choices/selection while old links stay valid',()=>{
  const valid=share.payload(share.draft(log,cards)),ids=new Set(['M17','M0']);
  for(const mutation of [{q:['A']},{q:[{},'B']},{a:3},{a:'2'},{n:'x'.repeat(241)},{k:2}])assert.equal(shared.validSharedPayload({...valid,...mutation},ids),false);
  assert.equal(shared.validSharedPayload({d:'進む',c:[['M17',0]]},ids),true);
});
test('recipient model carries only opted-in memo and same selected choice',()=>{
  const data=share.draft(log,cards);data.includeMemo=true;
  const p=decode(data),normalized=shared.normalizeSharedPayload(p,{deck:cards,contentById:new Map(),contentCardId:c=>c.id,cardImage:c=>c.image,compare:()=>null});
  assert.equal(normalized.consultation,true);assert.equal(normalized.chosen,2);assert.equal(normalized.memo,'PRIVATE MEMO');assert.deepEqual(Array.from(normalized.choices),p.q);
});
test('length limits hold without breaking an emoji at the boundary',()=>{
  const data=share.draft({...log,options:{'1':'x'.repeat(29)+'😀','2':'B'}},cards);data.question='q'.repeat(59)+'😀';
  assert.doesNotThrow(()=>decode(data));const p=decode(data);assert.ok(p.t.length<=60);assert.ok(p.q[0].length<=30);
});

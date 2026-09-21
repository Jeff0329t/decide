import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sharedSource=fs.readFileSync(new URL('../dist/shared.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const cssSource=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/cards.json',import.meta.url),'utf8'));
const context={atob,btoa,escape,decodeURIComponent,globalThis:null};
context.globalThis=context;
vm.runInNewContext(sharedSource,context);
const shared=context.DECIDE_SHARED;

const suitIndex={wa:0,cu:1,sw:2,pe:3};
const deck=data.cards.map(card=>{
  const code=card.id.slice(0,2);
  const number=Number(card.id.slice(2));
  return {
    id:code==='ar'?`M${number}`:`m${suitIndex[code]}-${number-1}`,
    name:card.name,
    image:`./assets/rider-waite/${card.id}.jpg`
  };
});
const validIds=new Set(deck.map(card=>card.id));
const contentById=new Map(data.cards.map(card=>[card.id,card]));
const encode=value=>btoa(unescape(encodeURIComponent(JSON.stringify(value))));
const helpers={
  deck, contentById,
  contentCardId:card=>card.image.match(/([a-z]{2}\d{2})\.jpg$/i)?.[1].toLowerCase()||'',
  cardImage:card=>card.image,
  compare:()=>({label:'比較結果'})
};
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const invalidHashes=[
  `#share=${encode({d:'選択肢1',c:[[deck[0].id,0]]}).slice(0,-3)}`,
  `#share=${btoa('not json')}`,
  `#share=${encode({d:'x',c:'notarray'})}`,
  `#share=${encode({d:'x',c:[['missing',0]]})}`,
  `#share=${'x'.repeat(9000)}`,
  `#share=${encode({d:'x'.repeat(41),c:[[deck[0].id,0]]})}`
];
for(const hash of invalidHashes){
  const result=shared.readSharedHash(hash,validIds);
  assert.equal(result.found,true);
  assert.equal(result.payload,null);
}

let rendered=0;
for(const base of deck){
  for(const reversed of [0,1]){
    const payload={d:'選択肢1',c:[[base.id,reversed]]};
    assert.equal(shared.validSharedPayload(payload,validIds),true);
    const normalized=shared.normalizeSharedPayload(payload,helpers);
    assert.ok(normalized);
    assert.equal(normalized.cards.length,1);
    const html=shared.renderSharedCard(normalized.cards[0],escapeHtml);
    assert.ok(!html.includes('undefined'));
    assert.ok(!html.includes('>null<'));
    assert.ok(normalized.cards[0].keywords.length>0);
    assert.ok(normalized.cards[0].meaning);
    assert.ok(normalized.cards[0].background);
    rendered++;
  }
}

const world=deck.find(card=>card.name==='世界');
const worldPayload=shared.normalizeSharedPayload({d:'保留する',c:[[world.id,1]]},helpers);
assert.equal(worldPayload.cards[0].meaning,contentById.get('ar21').reversed.meaning);

for(const legacyName of ['MAJOR'+'_READINGS','SUIT'+'_READINGS','RANK'+'_READINGS','interpret'+'ation']){
  assert.ok(!appSource.includes(legacyName),`${legacyName} must be removed`);
}
assert.match(appSource,/このリンクは読み込めませんでした/);
assert.match(appSource,/リンクが途中で切れているか、古い形式かもしれません。/);
assert.match(appSource,/DECIDEを使ってみる/);
assert.match(appSource,/view==='history' \|\| view==='detail'/);
assert.match(appSource,/setAttribute\('aria-current','page'\)/);
assert.match(appSource,/try \{[\s\S]*renderSharedResult\(\)[\s\S]*catch\(error\)/);
assert.match(cssSource,/\.theme-tabs button \{[^}]*min-height: 44px/);
assert.match(cssSource,/\.card-detail-sheet \.sheet-head button \{ width: 44px; height: 44px; \}/);

console.log(`P8 shared result: OK (${rendered} card orientations rendered)`);

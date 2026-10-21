import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const document=JSON.parse(fs.readFileSync(new URL('../dist/assets/cards.json',import.meta.url),'utf8'));
const before=JSON.parse(fs.readFileSync(new URL('../backups/cards.before-p16a.json',import.meta.url),'utf8'));

function leafDifferences(left,right,path='',out=[]) {
  if(left===right)return out;
  if(!left || !right || typeof left!=='object' || typeof right!=='object') { out.push(path); return out; }
  const keys=new Set([...Object.keys(left),...Object.keys(right)]);
  for(const key of keys)leafDifferences(left[key],right[key],path ? `${path}.${key}` : key,out);
  return out;
}

test('all 78 cards have complete copy for both orientations and five themes',()=>{
  assert.equal(document.cards.length,78);
  const themes=['blind','caution','want','letgo','diff'];
  for(const card of document.cards)for(const orientation of ['upright','reversed']) {
    const copy=card[orientation];
    assert.equal(typeof copy.meaning,'string',`${card.id}.${orientation}.meaning`);
    assert.ok(copy.meaning.trim(),`${card.id}.${orientation}.meaning is empty`);
    for(const theme of themes) {
      const value=copy.themes?.[theme];
      assert.equal(typeof value,'string',`${card.id}.${orientation}.themes.${theme}`);
      assert.ok(value.trim(),`${card.id}.${orientation}.themes.${theme} is empty`);
    }
  }
});

test('requested representative copy is present',()=>{
  const byId=new Map(document.cards.map(card=>[card.id,card]));
  assert.ok(byId.get('ar00').upright.themes.letgo);
  assert.ok(byId.get('pe13').upright.themes.blind);
  for(const card of document.cards)for(const orientation of ['upright','reversed'])assert.ok(card[orientation].themes.diff);
});

test('editorial updates preserve card identities, scores and data structure',()=>{
  const differences=leafDifferences(before,document);
  assert.ok(differences.length>314);
  for(const path of differences)assert.match(path,/^(cards\.\d+\.(story|background|(upright|reversed)\.(meaning|keywords\.\d+|themes\.(blind|caution|want|letgo|diff)))|meta\.(version|generated|note)|themes\.(blind|caution|want|letgo|diff))$/);
  for(let index=0;index<document.cards.length;index++) {
    const card=document.cards[index],original=before.cards[index];
    for(const key of ['id','name','en','image','arcana','symbol'])assert.equal(card[key],original[key],`${card.id}.${key}`);
    for(const direction of ['upright','reversed']) {
      assert.equal(card[direction].score,original[direction].score,`${card.id}.${direction}.score`);
      assert.equal(card[direction].keywords.length,3);
    }
  }
});

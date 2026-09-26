import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cards=JSON.parse(await readFile(new URL('../dist/assets/cards.json',import.meta.url),'utf8'));
const learn=JSON.parse(await readFile(new URL('../dist/assets/learn.json',import.meta.url),'utf8'));
const source=await readFile(new URL('../dist/learn.js',import.meta.url),'utf8');
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const worker=await readFile(new URL('../dist/service-worker.js',import.meta.url),'utf8');

test('six lessons contain complete reading content',()=>{
  assert.equal(learn.lessons.length,6);
  for(const [index,lesson] of learn.lessons.entries()){
    assert.equal(lesson.id,`l${index+1}`);
    assert.ok(lesson.title && lesson.summary && lesson.minutes===1);
    assert.ok(lesson.body.length && lesson.body.every(Boolean));
    assert.ok(lesson.points.length && lesson.points.every(Boolean));
  }
  assert.equal(learn.suits.length,4);
  assert.equal(learn.numbers.length,10);
  assert.equal(learn.court.length,4);
  assert.equal(learn.majorJourney.length,4);
  assert.doesNotMatch(source,/learn-quiz|action==='answer'/);
});

test('all 78 cards have searchable meanings, keywords and themes',()=>{
  assert.equal(cards.cards.length,78);
  assert.equal(new Set(cards.cards.map(card=>card.id)).size,78);
  for(const card of cards.cards)for(const orientation of ['upright','reversed']){
    assert.ok(card[orientation].meaning);
    assert.ok(card[orientation].keywords.length);
    assert.equal(Object.keys(card[orientation].themes).length,5);
  }
});

test('learning state is separate and learning asset loads on entry',()=>{
  assert.match(source,/decide\.tarot\.learn\.v1/);
  assert.match(source,/function fetchData\(\)/);
  assert.match(source,/fetch\('\.\/assets\/learn\.json'\)/);
  assert.match(source,/function open\(\)/);
  assert.match(source,/IntersectionObserver/);
  assert.match(source,/\.textContent=/);
  assert.doesNotMatch(source,/localStorage\.(?:setItem|removeItem)\((?:STORAGE_KEY|SETTINGS_KEY)/);
  assert.match(app,/data-action="open-learn"/);
  assert.match(worker,/\.\/learn\.js/);
  assert.match(worker,/\.\/assets\/learn\.json/);
});

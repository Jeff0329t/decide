import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require=createRequire(import.meta.url);
const scoring=require('../dist/scoring.js');
const data=JSON.parse(readFileSync(new URL('../dist/assets/cards.json',import.meta.url),'utf8'));
const states=data.cards.flatMap(card=>['upright','reversed'].map(direction=>({id:card.id,name:card.name,direction,score:card[direction].score,keywords:card[direction].keywords})));
const compare=(first,second)=>scoring.compare(first,second);
const state=(id,direction)=>states.find(item=>item.id===id && item.direction===direction);

const swordFour=state('sw04','upright');
const pentaclesTen=state('pe10','upright');
const requested=compare(swordFour,pentaclesTen);
assert.equal(swordFour.score,2);
assert.equal(pentaclesTen.score,5);
assert.equal(requested.label,'カードの視点では、選択肢2がおすすめです');

let combinations=0;
for(const first of states)for(const second of states) {
  if(first.id===second.id)continue;
  const result=compare(first,second);
  assert.ok(result.label && result.reason && result.closing);
  assert.equal(result.scores.length,2);
  assert.doesNotMatch(JSON.stringify(result),/undefined|null|優勢/);
  combinations++;
}
assert.equal(combinations,156*154);

const equalPair=states.find(first=>states.some(second=>second.id!==first.id && second.score===first.score && first.score===3));
const equalOther=states.find(second=>second.id!==equalPair.id && second.score===equalPair.score);
const onePair=states.find(first=>states.some(second=>second.id!==first.id && Math.abs(first.score-second.score)===1));
const oneOther=states.find(second=>second.id!==onePair.id && Math.abs(onePair.score-second.score)===1);
const lowPair=states.filter(item=>item.score<=2).slice(0,2);
const highPair=states.filter(item=>item.score>=4).slice(0,2);

const cases={
  equal:compare(equalPair,equalOther),
  differenceOne:compare(onePair,oneOther),
  differenceTwoOrMore:requested,
  bothLow:compare(lowPair[0],lowPair[1]),
  bothHigh:compare(highPair[0],highPair[1])
};
assert.equal(cases.equal.label,'拮抗しています。どちらも同じくらいの追い風です');
assert.equal(cases.equal.note,'差がつかないときは、「決め手になる違い」を深掘りしましょう。');
assert.match(cases.differenceOne.label,/^わずかに、選択肢[12]が進めやすそうです$/);
assert.equal(cases.bothLow.note,'どちらも今は慎重に。急がず条件を整える時期かもしれません。');
assert.equal(cases.bothHigh.note,'どちらも追い風です。差は小さいので、本音で選んで大丈夫です。');

for(const file of ['../dist/app.js','../dist/scoring.js','../dist/assets/cards.json'])assert.doesNotMatch(readFileSync(new URL(file,import.meta.url),'utf8'),/優勢/);
assert.match(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),/\['選択肢1','選択肢2','保留する'\]/);
const appSource=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
assert.match(appSource,/aria-label="\$\{esc\(label\)\}、5段階中\$\{score\}"/);
assert.match(appSource,/if\(mode==='two'\)preloadCardImages\(drawOptions\)/);
assert.doesNotMatch(appSource,/await \(activeSession\.imageReady \|\| preloadCardImages/);
assert.equal(scoring.stars(2),'★★☆☆☆');
assert.match(appSource,/function renderStars\(score,label\)/,'stars are rendered as mobile-safe SVG icons');
assert.match(appSource,/class="compare-heading"[\s\S]*renderStars\(verdict\.scores\[index\]/,'each choice heading includes its five-star score');

console.log(`P1 scoring: OK (${combinations} ordered combinations)`);
for(const [name,result] of Object.entries(cases))console.log(`${name}: ${result.label}${result.note?` / ${result.note}`:''}`);

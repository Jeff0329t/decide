import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const interviewSource=fs.readFileSync(new URL('../dist/interview.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const cssSource=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
const context={globalThis:null}; context.globalThis=context;
vm.runInNewContext(interviewSource,context);
const interview=context.DECIDE_INTERVIEW;

assert.deepEqual(
  JSON.parse(JSON.stringify(interview.availablePrompts('one').map(item=>[item.label,item.prompt]))),
  [
    ['見落としがありそう','見落としていること'],
    ['進むのが不安','進むときの注意点'],
    ['本音が分からない','本当はどうしたい？'],
    ['手放したいものがある','手放してよいこと']
  ]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(interview.availablePrompts('two').map(item=>[item.label,item.prompt]))),
  [
    ['決め手がほしい','決め手になる違い'],
    ['選択肢1が不安','選択肢1を選ぶときの注意点'],
    ['選択肢2が不安','選択肢2を選ぶときの注意点'],
    ['本音を知りたい','本当はどちらを望んでいる？']
  ]
);

for(const mode of ['one','two']){
  const all=interview.PROMPTS[mode];
  for(let usedCount=0;usedCount<=all.length;usedCount++){
    const used=all.slice(0,usedCount).map(item=>item.prompt);
    const remaining=interview.availablePrompts(mode,used);
    assert.equal(remaining.length,all.length-usedCount);
    assert.ok(remaining.every(item=>!used.includes(item.prompt)));
  }
  assert.equal(interview.availablePrompts(mode,all.map(item=>item.prompt)).length,0);
}

assert.match(appSource,/このカード、しっくりきましたか？/);
assert.match(appSource,/この結果、しっくりきましたか？/);
assert.match(appSource,/しっくりきた → 決める/);
assert.match(appSource,/data-action="toggle-reflection" aria-expanded="false"/);
assert.match(appSource,/setAttribute\('aria-expanded',String\(!expanded\)\)/);
assert.match(appSource,/renderCard\(node,index \+ 2,true\)/);
assert.ok(!appSource.includes('decision-dock'));
assert.ok(!appSource.includes('これで決めた'));
assert.ok(!appSource.includes('もう少し考えるなら'));
assert.match(cssSource,/\.choice-comparison \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
assert.match(cssSource,/\.reflection-actions \.button \{ min-height: 48px; \}/);
assert.match(cssSource,/@media \(max-width: 460px\) and \(max-height: 720px\)/);
assert.ok(!cssSource.includes('.decision-dock'));

console.log('P9 interview flow: OK (one/two, all prompt depletion states)');

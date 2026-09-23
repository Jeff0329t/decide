import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/styles.css',import.meta.url),'utf8');

test('tutorial uses its own key and requires no marker, no logs and no shared link',()=>{
  assert.match(app,/const TUTORIAL_KEY = 'decide\.tarot\.tutorial\.v1'/);
  assert.match(app,/currentView!=='home' \|\| sharedPayload \|\| logs\.length \|\| tutorial/);
  assert.match(app,/localStorage\.getItem\(TUTORIAL_KEY\)===null/);
  assert.match(app,/safeSetItem\(TUTORIAL_KEY,JSON\.stringify\(\{status,at:new Date\(\)\.toISOString\(\),version:1\}\)\)/);
  assert.match(app,/status==='completed'\?'complete':'skip'/);
});

test('intro is an accessible three-step dialog with exact copy and no input',()=>{
  assert.match(app,/setAttribute\('role','dialog'\)/);
  assert.match(app,/setAttribute\('aria-modal','true'\)/);
  for(const copy of ['心から納得いく決断を。','1 迷いを1つ、心の中で思い浮かべる（入力は要りません）','2 カードを1枚、直感で選ぶ','3 出てきた言葉が『しっくりくるか』だけ、答える','カードは答えを決めません。決めるのは、あなたです。','やってみる','スキップ'])assert.ok(app.includes(copy));
  assert.match(app,/start\.focus\(\)/);
  assert.match(app,/event\.key==='Escape'\)\{ event\.preventDefault\(\); finishTutorial\('skipped'\)/);
});

test('tutorial draw uses 22 major cards and keeps deck mode unchanged',()=>{
  assert.match(app,/drawOptions:shuffledDeck\(MAJOR\)/);
  assert.match(app,/function shuffledDeck\(source=settings\.deckMode\.startsWith\('major'\) \? MAJOR : DECK\)/);
  assert.match(app,/orientation:useReversed && Math\.random\(\)<\.28 \? 'reversed' : 'upright'/);
  assert.match(app,/if\(activeSession\?\.tutorial\)await loadCardContent\(\)/);
  assert.match(app,/if\(tutorial\?\.stage===2\)beginTutorialResult\(\)/);
});

test('keywords, hearing highlight, completion and replay are wired',()=>{
  assert.match(app,/cardKeywords\(activeSession\.nodes\[0\]\.card\)/);
  assert.match(app,/button\.setAttribute\('aria-pressed',String\(tutorial\.selectedKeyword===index\)\)/);
  assert.match(app,/tutorial\.phase='reflection'/);
  assert.match(app,/reflection\.classList\.add\('tutorial-highlight'\)/);
  assert.match(app,/done\.textContent='わかった'/);
  assert.match(app,/toast\('使い方は以上です。設定からいつでも見直せます。'\)/);
  assert.match(app,/data-action="tutorial-replay"/);
  assert.match(app,/localStorage\.removeItem\(TUTORIAL_KEY\)/);
  assert.match(app,/tutorialEvent\(action, step\) \{ window\.dispatchEvent\(new CustomEvent\('decide:tutorial',\{detail:\{action,step\}\}\)\)/);
});

test('callouts are live statuses with 44px controls and 15px text',()=>{
  assert.match(app,/bubble\.setAttribute\('role','status'\)/);
  assert.match(app,/bubble\.setAttribute\('aria-live','polite'\)/);
  assert.match(app,/controls\.append\(tutorialProgress\(tutorial\.stage\),skip\); document\.body\.append\(controls\)/);
  assert.match(css,/\.tutorial-keywords button \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-stage-controls button \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-callout p \{[^}]*font-size: 15px/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/@media \(prefers-color-scheme: dark\)/);
});

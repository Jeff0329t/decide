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
  for(const copy of ['心から納得いく決断を。','DRAW','DECIDE','LOOK BACK','迷いを1つ思い浮かべ、カードを直感で1枚引く','ログに残す','決める精度が上がっていく','カードは答えを決めません。決めるのは、あなたです。','やってみる','スキップ'])assert.ok(app.includes(copy));
  assert.match(app,/tutorial-intro-actions/);
  assert.match(app,/tutorial-intro-skip-bottom/);
  assert.match(app,/actions\.append\(skipBottom,start\)/);
  assert.match(app,/start\.focus\(\)/);
  assert.match(app,/event\.key==='Escape'\)\{ event\.preventDefault\(\); finishTutorial\('skipped'\)/);
});

test('tutorial draw uses 22 major cards and keeps deck mode unchanged',()=>{
  assert.match(app,/drawOptions:shuffledDeck\(MAJOR\)/);
  assert.match(app,/function shuffledDeck\(source=settings\.deckMode\.startsWith\('major'\) \? MAJOR : DECK\)/);
  assert.match(app,/orientation:useReversed && Math\.random\(\)<\.28 \? 'reversed' : 'upright'/);
  assert.match(app,/if\(activeSession\?\.tutorial\)loadCardContent\(\)/);
  assert.match(app,/if\(tutorial\?\.stage===2\)beginTutorialResult\(\)/);
});

test('keywords, hearing highlight, completion and replay are wired',()=>{
  assert.match(app,/cardKeywords\(activeSession\.nodes\[0\]\.card\)/);
  assert.match(app,/button\.setAttribute\('aria-pressed',String\(tutorial\.selectedKeyword===index\)\)/);
  assert.match(app,/tutorial\.phase='reflection'/);
  assert.match(app,/reflection\.classList\.add\('tutorial-highlight'\)/);
  assert.match(app,/done\.textContent='わかった'/);
  assert.match(app,/toast\('ログと統計から、いつでも振り返れます'\)/);
  assert.match(app,/data-action="tutorial-replay"/);
  assert.match(app,/localStorage\.removeItem\(TUTORIAL_KEY\)/);
  assert.match(app,/tutorialEvent\(action, step\) \{ window\.dispatchEvent\(new CustomEvent\('decide:tutorial',\{detail:\{action,step\}\}\)\)/);
});

test('callouts are live statuses with 44px controls and 15px text',()=>{
  assert.match(app,/bubble\.setAttribute\('role','status'\)/);
  assert.match(app,/bubble\.setAttribute\('aria-live','polite'\)/);
  assert.match(app,/const page=tutorial\.stage-1;[\s\S]*controls\.append\(tutorialProgress\(page\),skip\); document\.body\.append\(controls\)/);
  assert.match(css,/\.tutorial-keywords button \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-stage-controls button \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-callout p \{[^}]*font-size: 15px/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/@media \(prefers-color-scheme: dark\)/);
});

test('intro has no page number and steps are numbered DRAW 01, DECIDE 02, LOOK BACK 03',()=>{
  assert.match(app,/dialog\.append\(heading,lines,note,actions\)/);
  assert.match(app,/const page=tutorial\.stage-1;/);
  assert.match(app,/top\.append\(tutorialProgress\(step\),skip\)/);
  assert.match(app,/tutorialOverlay\(2,'tutorial-logstep'/);
  assert.match(app,/tutorialOverlay\(3,'tutorial-reviewstep'/);
});

test('LOOK BACK shows a sample log and an unsaved trial review before completion',()=>{
  assert.match(app,/done\.dataset\.action='tutorial-next'; done\.textContent='次へ'/);
  assert.match(app,/action === 'tutorial-log-next'\) beginTutorialLookBack\(\)/);
  assert.match(app,/if\(tutorial\?\.stage!==3 \|\| tutorial\.phase!=='log' \|\| !tutorial\.decision\)return;/);
  assert.match(app,/action === 'tutorial-review'\) chooseTutorialReview\(el\.dataset\.value\)/);
  assert.match(app,/action === 'tutorial-complete'\) \{ if\(tutorial\?\.stage===4 && tutorial\.review\)finishTutorial\('completed'\)/);
  for(const copy of ['後日、その決断をレビューする。','決断の傾向がわかります','DECISION LOG','この選択、その後どうでした？','（保存はされません）','良かった','まあ良かった','どちらとも言えない','違った'])assert.ok(app.includes(copy),copy);
  const lookBack=app.slice(app.indexOf('function beginTutorialLookBack'),app.indexOf('function finishTutorial'));
  assert.doesNotMatch(lookBack,/saveLogs|logs\.push|safeSetItem\(STORAGE_KEY/);
  assert.match(css,/\.tutorial-lookback-skip \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-mock-reviews \.review-button \{ min-height: 72px/);
});

test('DECIDE log step shows what a log records and why, without saving',()=>{
  assert.match(app,/action === 'tutorial-next'\) beginTutorialLog\(\)/);
  assert.match(app,/action === 'tutorial-decision'\) chooseTutorialDecision\(el\.dataset\.value\)/);
  for(const copy of ['決めたら、ログに残す。','1件のログに、こんなことが残ります。','（今日）','決めたこと','進む','見送る','保留する','決め手・今の気持ち','時間が経つと忘れたり、結果に合わせて書き換わったりします','後で結果と正直に比べられます','その時の気持ち'])assert.ok(app.includes(copy),copy);
  const logStep=app.slice(app.indexOf('function beginTutorialLog'),app.indexOf('function beginTutorialLookBack'));
  assert.doesNotMatch(logStep,/saveLogs|logs\.push|safeSetItem\(STORAGE_KEY/);
  assert.match(css,/\.tutorial-mock-decisions button \{ min-height: 44px;[^}]*font-size: 15px/);
});

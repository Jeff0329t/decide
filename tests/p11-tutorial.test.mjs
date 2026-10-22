import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/styles.css',import.meta.url),'utf8');
// Tutorial copy marks phrase boundaries with ｜ and line breaks with \n; compare the plain sentence.
const copyText=app.replace(/｜|\\n/g,'');

test('tutorial uses its own key and requires no marker, no logs and no shared link',()=>{
  assert.match(app,/const TUTORIAL_KEY = 'decide\.tarot\.tutorial\.v1'/);
  assert.match(app,/currentView!=='home' \|\| sharedPayload \|\| logs\.length \|\| tutorial/);
  assert.match(app,/localStorage\.getItem\(TUTORIAL_KEY\)===null/);
  assert.match(app,/safeSetItem\(TUTORIAL_KEY,JSON\.stringify\(\{status,at:new Date\(\)\.toISOString\(\),version:1\}\)\)/);
  assert.match(app,/status==='completed'\?'complete':'skip'/);
});

test('intro explains a concrete unsaved trial in an accessible three-step dialog',()=>{
  assert.match(app,/setAttribute\('role','dialog'\)/);
  assert.match(app,/setAttribute\('aria-modal','true'\)/);
  for(const copy of ['引く。決める。振り返る。','引く','決める','振り返る','カードを1枚選んで、意味を読む','練習は保存されません。','覚えなくて大丈夫です。','1枚引いて試す','スキップ'])assert.ok(copyText.includes(copy),copy);
  assert.match(app,/tutorial-intro-actions/);
  assert.match(app,/tutorial-intro-skip-bottom/);
  assert.match(app,/actions\.append\(skipBottom,start\)/);
  assert.match(app,/start\.focus\(\{preventScroll:true\}\)/);
  assert.match(app,/event\.key==='Escape'\)\{ event\.preventDefault\(\); finishTutorial\('skipped'\)/);
});

test('intro explains WHY and WHAT before HOW, then starts the trial',()=>{
  for(const copy of ['心から納得いく決断を。','自分で選んで「これでよかった」と思えるためのアプリです。','タロットは、心を映す鏡。','未来を当てるためではなく、自分で決めるために使います。','「表が出てほしい」と思ったら、それが本音。','占いを信じなくても、使えます。','久しぶりの友人に、連絡してみる？'])assert.ok(copyText.includes(copy),copy);
  assert.doesNotMatch(app,/友だちに連絡しようかな/);
  assert.match(app,/tutorial=\{stage:1,introPage:0,/);
  assert.match(app,/action === 'tutorial-intro-next'\) nextTutorialIntroPage\(\)/);
  assert.match(app,/if\(last\)\{ start\.dataset\.action='tutorial-start'; start\.textContent='1枚引いて試す'; \}\n  else \{ start\.dataset\.action='tutorial-intro-next'; start\.textContent='次へ'; \}/);
  assert.match(css,/\.tutorial-concept p \{[^}]*font-size: 16px/);
});

test('tutorial draw uses 22 upright major cards and keeps deck mode unchanged',()=>{
  assert.match(app,/drawOptions:shuffledDeck\(MAJOR,false\)/);
  assert.match(app,/function shuffledDeck\(source=settings\.deckMode\.startsWith\('major'\) \? MAJOR : DECK, useReversed=settings\.deckMode\.endsWith\('reversed'\)\)/);
  assert.match(app,/orientation:useReversed && Math\.random\(\)<\.28 \? 'reversed' : 'upright'/);
  assert.match(app,/const contentReady=loadCardContent\(\);\n  if\(!activeSession \|\| activeSession\.id!==sessionId\)return;/);
  assert.match(app,/if\(tutorial\?\.stage===2\)beginTutorialResult\(\)/);
});

test('keywords, hearing highlight, completion and replay are wired',()=>{
  assert.match(app,/cardKeywords\(activeSession\.nodes\[0\]\.card\)/);
  assert.match(app,/button\.setAttribute\('aria-pressed',String\(tutorial\.selectedKeyword===index\)\)/);
  assert.match(app,/tutorial\.phase='reflection'/);
  assert.match(app,/reflection\.classList\.add\('tutorial-highlight'\)/);
  assert.match(app,/done\.textContent='自分の迷いで始める'/);
  assert.match(app,/toast\('小さな迷いから、始めてみましょう'\)/);
  assert.match(app,/data-action="tutorial-replay"/);
  assert.match(app,/localStorage\.removeItem\(TUTORIAL_KEY\)/);
  assert.match(app,/tutorialEvent\(action, step\) \{ window\.dispatchEvent\(new CustomEvent\('decide:tutorial',\{detail:\{action,step\}\}\)\)/);
});

test('callouts are live statuses with 44px controls and 15px text',()=>{
  assert.match(app,/bubble\.setAttribute\('role','status'\)/);
  assert.match(app,/bubble\.setAttribute\('aria-live','polite'\)/);
  assert.match(app,/const page=tutorial\.stage-1;[\s\S]*controls\.append\(tutorialProgress\(page\),skip\); appOverlayRoot\(\)\.append\(controls\)/);
  assert.match(css,/\.tutorial-keywords button \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-stage-controls button \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-callout p \{[^}]*font-size: 15px/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/@media \(prefers-color-scheme: dark\)/);
});

test('intro has no page number and steps are numbered DRAW 01, DECIDE 02, LOOK BACK 03',()=>{
  assert.match(app,/dialog\.replaceChildren\(heading,example,lines,note,actions\)/);
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
  for(const copy of ['数日たったら、振り返ってみましょう。','決断への納得が深まります','決めたことのメモ','やってみて、どうでしたか？','（練習なので保存されません）','良かった','まあ良かった','どちらとも言えない','違った'])assert.ok(copyText.includes(copy),copy);
  const lookBack=app.slice(app.indexOf('function beginTutorialLookBack'),app.indexOf('function finishTutorial'));
  assert.doesNotMatch(lookBack,/saveLogs|logs\.push|safeSetItem\(STORAGE_KEY/);
  assert.match(css,/\.tutorial-lookback-skip \{ min-height: 44px;[^}]*font-size: 15px/);
  assert.match(css,/\.tutorial-mock-reviews \.review-button \{ min-height: 72px/);
});

test('DECIDE log step shows what a log records and why, without saving',()=>{
  assert.match(app,/action === 'tutorial-next'\) beginTutorialLog\(\)/);
  assert.match(app,/action === 'tutorial-decision'\) chooseTutorialDecision\(el\.dataset\.value\)/);
  for(const copy of ['決めたことを、メモしよう。','保存したメモは、下の「ログ」から読めます。','（今日）','決めたこと','進む','見送る','保留する','決めた理由・今の気持ち','あとで思い出せます','短いひとことだけでもOKです','その時の気持ち'])assert.ok(copyText.includes(copy),copy);
  const logStep=app.slice(app.indexOf('function beginTutorialLog'),app.indexOf('function beginTutorialLookBack'));
  assert.doesNotMatch(logStep,/saveLogs|logs\.push|safeSetItem\(STORAGE_KEY/);
  assert.match(css,/\.tutorial-mock-decisions button \{ min-height: 44px;[^}]*font-size: 15px/);
});

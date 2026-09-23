import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
const cards=JSON.parse(fs.readFileSync(new URL('../dist/assets/cards.json',import.meta.url),'utf8'));
const sharedSource=fs.readFileSync(new URL('../dist/shared.js',import.meta.url),'utf8');
const context={globalThis:null}; context.globalThis=context;
vm.runInNewContext(sharedSource,context);

function luminance(hex){
  const rgb=hex.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function contrast(a,b){
  const x=luminance(a), y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

test('P13 copy, headings, defaults, and duplicate delete semantics',()=>{
  const queen=cards.cards.find(card=>card.id==='pe13');
  assert.equal(queen.upright.themes.blind,'暮らしの土台を整えることに、いま何より価値があるのではありませんか。');
  assert.match(app,/feedback: savedSettings\.feedback === true/);
  assert.match(app,/ひとつの迷いを考える/);
  assert.match(app,/2つの選択肢を比べる/);
  assert.match(app,/class="map-heading"[^]*<h1>/);
  assert.match(app,/class="swipe-delete"[^>]*aria-hidden="true" tabindex="-1"/);
  assert.match(app,/data-shared-title/);
  assert.match(app,/data-shared-story/);
});

test('shared result wording covers match, mismatch, and tie',()=>{
  const outcome=context.DECIDE_SHARED.sharedOutcomeText;
  assert.equal(outcome('選択肢2',{tie:false,difference:-2}),'選んだ答え：選択肢2　（カードの視点でもおすすめでした）');
  assert.equal(outcome('選択肢2',{tie:false,difference:2}),'選んだ答え：選択肢2　（カードの視点では、選択肢1が進めやすそうでした。決めたのは本人です）');
  assert.equal(outcome('選択肢2',{tie:true,difference:0}),'選んだ答え：選択肢2');
});

test('declared small text and requested tap targets meet minimums',()=>{
  const below12=[...css.matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)/g)].filter(([,value,unit])=>unit==='px'?Number(value)<12:Number(value)*16<12);
  assert.deepEqual(below12.map(match=>match[0]),[]);
  for(const rule of [
    [/\.view-switch button \{[^}]*min-height: 44px/,'history view switch'],
    [/\.calendar-toolbar button \{[^}]*width: 44px; height: 44px/,'calendar controls'],
    [/\.outcome button \{[^}]*min-height: 44px/,'share result button'],
    [/\.card-more \{[^}]*min-height: 44px/,'card detail link'],
    [/\.danger-zone button \{[^}]*min-height: 44px/,'history delete button'],
    [/\.sheet-head button \{[^}]*width: 48px;[^}]*height: 48px/,'sheet close button'],
    [/\.segmented-switch button \{[^}]*min-height: 44px/,'settings switches'],
    [/\.toggle-button \{[^}]*min-height: 44px/,'feedback switch'],
    [/\.storage-banner \.banner-close \{[^}]*width: 44px; height: 44px/,'banner close button'],
    [/\.storage-banner \.button \{[^}]*min-height: 44px/,'backup banner button']
  ])assert.match(css,rule[0],rule[1]);
});

test('light palette reaches 4.5:1 without changing dark palette declarations',()=>{
  assert.ok(contrast('#656b76','#f4f5f7')>=4.5);
  assert.ok(contrast('#3e5fc9','#eaf0ff')>=4.5);
  assert.ok(contrast('#555c68','#d8dbe2')>=4.5);
  assert.match(css,/@media \(prefers-color-scheme: dark\)[^]*--muted: #b5bdca;[^]*--accent: #9bb4ff;[^]*--switch-ink: #eef2f8;/);
});

test('result focus and short viewport rules are scoped to display only',()=>{
  assert.match(css,/main:focus, main:focus-visible \{ outline: none; \}/);
  assert.match(css,/@media \(max-width: 460px\) and \(max-height: 720px\)[^]*\.reading-image-frame \{ width: 76px/);
  assert.match(css,/@media \(max-width: 460px\)[^]*\.calendar-wrap \{ margin-inline: -10px; \}[^]*\.week-row, \.calendar-grid \{ gap: 2px; \}/);
  assert.match(css,/word-break: keep-all/);
});

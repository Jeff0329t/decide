import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';

const require=createRequire(import.meta.url);
const meta=require('../dist/decision-meta.js');
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');

const nodes=[
  {label:'選択肢 1',question:'選択肢1を選んだとき',card:{name:'星',orientation:'upright'}},
  {label:'選択肢 2',question:'選択肢2を選んだとき',card:{name:'月',orientation:'reversed'}}
];

test('all requested genres and pair presets are available',()=>{
  assert.equal(meta.GENRES.length,9);
  assert.deepEqual(meta.PAIRS['仕事'][0],['今の仕事を続ける','新しい仕事に挑戦する']);
  assert.deepEqual(meta.PAIRS['その他'][1],['今','あと']);
});

test('options are optional, capped at 30, and recent values are unique/max four',()=>{
  assert.equal(meta.savedOptions('',''),null);
  assert.equal(meta.savedOptions('あ'.repeat(40),'B')['1'].length,30);
  const logs=[{options:{'1':'A','2':'B'}},{options:{'1':'A','2':'C'}},{options:{'1':'D','2':'E'}}];
  assert.deepEqual(meta.recentChoices(logs),['A','B','C','D']);
});

test('automatic titles follow priority and manual title is preserved in save code',()=>{
  const date='2026-09-21T10:00:00+09:00';
  assert.equal(meta.autoTitle({genre:'仕事',options:{'1':'続ける','2':'挑戦する'},nodes,createdAt:date,mode:'two'}),'仕事：続ける／挑戦する');
  assert.equal(meta.autoTitle({genre:'健康',nodes,createdAt:date,mode:'two'}),'健康：星・9/21');
  assert.equal(meta.autoTitle({nodes,createdAt:date,mode:'two'}),'星／月・9/21');
  assert.equal(meta.autoTitle({nodes:[nodes[0]],createdAt:date,mode:'one'}),'星（正位置）・9/21');
  assert.match(app,/manualTitle\|\|DECIDE_DECISION\.autoTitle/);
});

test('history labels expose genre/options and old records remain compatible',()=>{
  const log={decision:'選択肢2',genre:'仕事',options:{'1':'続ける','2':'挑戦する'}};
  assert.equal(meta.decisionText(log),'選択肢2（挑戦する）');
  assert.equal(meta.nodeLabel(log,nodes[0],0),'選択肢1：続ける');
  assert.equal(nodes[0].question,'選択肢1を選んだとき');
  assert.equal(meta.decisionText({decision:'進む'}),'進む');
  assert.equal(meta.nodeLabel({},nodes[0],0),'選択肢1');
  assert.match(app,/log\.genre,log\.options\?\.\['1'\],log\.options\?\.\['2'\]/);
});

test('new fields save and export/import paths preserve optional fields without changing schema',()=>{
  assert.match(app,/review:null, genre, options/);
  assert.match(app,/const BACKUP_SCHEMA = 1/);
  assert.match(app,/return \{ app:'DECIDE', schema:BACKUP_SCHEMA, exportedAt:new Date\(\)\.toISOString\(\), logs \}/);
  assert.match(app,/additions\.push\(incoming\)/);
});

test('share payload remains limited to existing fields and never serializes genre/options',()=>{
  const shareFunction=app.slice(app.indexOf('function sharedResultUrl'),app.indexOf('function openShare'));
  assert.doesNotMatch(shareFunction,/genre|options/);
  assert.match(shareFunction,/decision:log\.decision/);
});

test('user-facing values are escaped or assigned with textContent/value',()=>{
  assert.match(app,/button\.textContent=`\$\{pair\[0\]\}／\$\{pair\[1\]\}`/);
  assert.match(app,/button\.textContent=value/);
  assert.match(app,/form\.elements\.title\.value=decisionDraft\.title/);
  assert.match(app,/esc\(DECIDE_DECISION\.decisionText\(log\)\)/);
});

test('mobile-safe inputs have required Japanese keyboard attributes',()=>{
  assert.match(app,/name="option1" maxlength="30" autocomplete="off" enterkeyhint="done" lang="ja"/);
  assert.match(app,/name="option2" maxlength="30" autocomplete="off" enterkeyhint="done" lang="ja"/);
});

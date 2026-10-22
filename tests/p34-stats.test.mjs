import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
const source=app.match(/function recentMonthCounts\([\s\S]*?\n\}/)?.[0];
const recentMonthCounts=Function(`${source}; return recentMonthCounts;`)();
const at=(y,m,d=1)=>({createdAt:new Date(y,m-1,d,12).toISOString()});

test('calendar month strip lists six consecutive months oldest first, keeping empty months',()=>{
  const logs=[at(2026,9),at(2026,9,2),at(2026,8),at(2026,6),at(2026,3),at(2025,12)];
  assert.deepEqual(recentMonthCounts(logs,new Date(2026,8,15)).map(({year,month,count})=>[year,month+1,count]),[[2026,4,0],[2026,5,0],[2026,6,1],[2026,7,0],[2026,8,1],[2026,9,2]]);
});

test('calendar month strip ignores invalid dates and crosses year boundaries',()=>{
  const logs=[at(2025,12),{createdAt:'broken'},at(2026,2),{},at(2025,11)];
  assert.deepEqual(recentMonthCounts(logs,new Date(2026,1,1)).map(({year,month,count})=>[year,month+1,count]),[[2025,9,0],[2025,10,0],[2025,11,1],[2025,12,1],[2026,1,0],[2026,2,1]]);
  assert.equal(recentMonthCounts([],new Date(2026,0,1)).length,6);
});

test('the calendar carries the month record with bars that jump to that month',()=>{
  assert.match(app,/data-action="calendar-month"/);
  assert.match(app,/action === 'calendar-month'/);
  assert.match(app,/この月の決定 \$\{monthLogs\.length\}件/);
  assert.match(css,/\.calendar-months\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});

test('stats has summary and theme tabs only (period moved to the log calendar)',()=>{
  assert.match(app,/const tabs=\[\['summary','サマリー'\],\['theme','テーマ'\]\];/);
  assert.doesNotMatch(app,/stats-period|PERIOD LOG/);
  assert.doesNotMatch(app,/data-value="emotion"|emotionPanel/);
  assert.match(app,/const current=panels\[statsTab\] \? statsTab : 'summary';/);
  assert.match(css,/\.stats-tabs \{ display: grid; grid-template-columns: repeat\(2,1fr\)/);
  assert.doesNotMatch(css,/\.emotion-bars/);
});

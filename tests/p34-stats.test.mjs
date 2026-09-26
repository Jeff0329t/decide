import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
const source=app.match(/function recentMonthCounts\([\s\S]*?\n\}/)?.[0];
const recentMonthCounts=Function(`${source}; return recentMonthCounts;`)();
const at=(y,m,d=1)=>({createdAt:new Date(y,m-1,d,12).toISOString()});

test('period stats show the newest six months first even when logs are newest-first',()=>{
  const logs=[at(2026,9),at(2026,9,2),at(2026,8),at(2026,6),at(2026,5),at(2026,3),at(2026,1),at(2025,12),at(2025,11)];
  assert.deepEqual(recentMonthCounts(logs),[['2026年9月',2],['2026年8月',1],['2026年6月',1],['2026年5月',1],['2026年3月',1],['2026年1月',1]]);
});

test('period stats ignore invalid dates and do not depend on input order',()=>{
  const logs=[at(2025,12),{createdAt:'broken'},at(2026,2),{},at(2025,11)];
  assert.deepEqual(recentMonthCounts(logs),[['2026年2月',1],['2025年12月',1],['2025年11月',1]]);
  assert.deepEqual(recentMonthCounts([]),[]);
});

test('stats has three tabs and no emotion tab',()=>{
  assert.match(app,/const tabs=\[\['summary','サマリー'\],\['theme','テーマ'\],\['period','期間'\]\];/);
  assert.doesNotMatch(app,/data-value="emotion"|emotionPanel/);
  assert.match(app,/const current=panels\[statsTab\] \? statsTab : 'summary';/);
  assert.match(css,/\.stats-tabs \{ display: grid; grid-template-columns: repeat\(3,1fr\)/);
  assert.doesNotMatch(css,/\.emotion-bars/);
});

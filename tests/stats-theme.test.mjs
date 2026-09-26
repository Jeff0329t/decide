import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL(`../dist/${path}`,import.meta.url),'utf8');
const app=read('app.js');
const css=read('styles.css');

test('stats themes open a decision log list for that theme',()=>{
  assert.match(app,/data-action="stats-theme"/);
  assert.match(app,/action === 'stats-theme'/);
  assert.match(app,/historyItem\(log,\{deletable:false\}\)/);
  assert.match(css,/\.stats-theme-logs \.history-row/);
});

test('details opened from stats return to stats',()=>{
  assert.match(app,/navigate\(detailReturn\)/);
  assert.match(app,/detailReturn==='stats'\?'統計へ':'履歴へ'/);
});

test('satisfaction rows are color-coded buttons that open the matching review log',()=>{
  const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
  assert.match(app,/data-action="stats-review"/);
  assert.match(app,/action === 'stats-review'/);
  assert.match(app,/'REVIEW LOG'/);
  for(const key of ['good','fair','neutral','bad']) assert.match(css,new RegExp(`\\.review-${key} \\{ --tone:`));
  assert.match(css,/conic-gradient\(var\(--good\) var\(--good-from/);
});

test('pending reviews get their own block and theme/period tabs are ranked panels',()=>{
  assert.match(app,/評価待ち/);
  assert.doesNotMatch(app,/未評価/);
  assert.match(app,/class="stats-pending/);
  assert.match(app,/'stats-period'/);
  assert.match(app,/action === 'stats-period'/);
  assert.match(app,/'PERIOD LOG'/);
  assert.match(css,/\.stats-pending \{/);
  assert.match(css,/\.stats-rank-row \{/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('#15 引いた回数はカードを実際にめくったときだけ数える', () => {
  const app = read('dist/app.js');
  const start = app.slice(app.indexOf('function startSession'), app.indexOf('function startSession') + 1500);
  assert.doesNotMatch(start, /recordDraw/);
  assert.match(app, /function recordDrawOnce\(\)/);
  assert.match(app, /drawRecorded/);
  assert.ok((app.match(/recordDrawOnce\(\);/g) || []).length >= 2);
});

test('#12 A/B の判断ボタンに入力した選択肢を表示する', () => {
  const app = read('dist/app.js');
  assert.match(app, /function decisionOptionText\(value\)/);
  assert.match(app, /<small[^>]*>\$\{esc\(decisionOptionText\(o\)\)\}<\/small>/);
  assert.match(read('dist/styles.css'), /\.decision-option small\s*\{/);
});

test('#17 リマインドを選び直したら今日から数える', () => {
  const app = read('dist/app.js');
  assert.match(app, /log\.remindAt=days>0 \? new Date\(Date\.now\(\)\+days\*DAY_MS\)/);
  assert.match(app, /log\.remindDays=days>0 \? days : null/);
});

test('#10 送信に失敗したリマインドは送信済みにしない', () => {
  const fn = read('supabase/functions/send-reminders/index.ts');
  assert.doesNotMatch(fn, /Mark sent even if/);
  assert.match(fn, /const finished = ok \|\| !live/);
  assert.match(fn, /GIVE_UP_MS/);
  assert.match(fn, /else live = true/);
});

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
  // 結果画面の3つのボタンは、入力した選択肢の文言をそのまま出す
  assert.match(app, /return decisionOptionText\(value\) \|\| DECIDE_DECISION\.choiceText\(value\);/);
});

test('#17 振り返る日は記録する前に選び、記録した日から数える', () => {
  const app = read('dist/app.js');
  assert.match(app, /if\(draftRemind\.days\)return new Date\(Date\.parse\(from\)\+draftRemind\.days\*DAY_MS\)/);
  assert.match(app, /log\.remindAt=draftRemindAt\(createdAt\)/);
});

test('#10 送信に失敗したリマインドは送信済みにしない', () => {
  const fn = read('supabase/functions/send-reminders/index.ts');
  assert.doesNotMatch(fn, /Mark sent even if/);
  assert.match(fn, /const finished = ok \|\| !live/);
  assert.match(fn, /GIVE_UP_MS/);
  assert.match(fn, /else live = true/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');

test('カードの並びは Fisher–Yates で混ぜる（sort に乱数を渡すと偏る）', () => {
  assert.doesNotMatch(app, /sort\(\(\)\s*=>\s*Math\.random\(\)/);
  const body = app.match(/function shuffledDeck\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)[1];
  const shuffledDeck = new Function('source', 'useReversed', body);
  const counts = [0, 0, 0];
  for(let i = 0; i < 30000; i++) counts[shuffledDeck([{ id: 'a' }, { id: 'b' }, { id: 'c' }], false).findIndex(card => card.id === 'a')]++;
  counts.forEach(count => assert.ok(Math.abs(count - 10000) < 600, String(counts)));
});

test('バックアップの取り込みでも、メールのリマインド予定を更新する', () => {
  const confirm = app.match(/function confirmImport\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(confirm, /DECIDE_EMAIL_REMINDERS\?\.schedule\?\.\(\)/);
});

test('WebMCP の start_decision_session は、まだ引いていないカードを返さない', () => {
  const tool = app.match(/name:'start_decision_session'[\s\S]*?\} \},/)[0];
  assert.doesNotMatch(tool, /cards:/);
  assert.match(tool, /next:'choose_genre'/);
});

test('?go=settings で開いたとき、あとから読み込まれる設定欄のために描き直す', () => {
  assert.match(app, /if\(currentView==='settings'\) document\.addEventListener\('DOMContentLoaded'/);
});

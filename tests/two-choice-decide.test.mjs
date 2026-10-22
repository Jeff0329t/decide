import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('dist/app.js');
const fnSource = name => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const next = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, next < 0 ? undefined : next);
};

test('2択の決定画面は3つのボタンだけで、おすすめやフォームを出さない', () => {
  const choose = fnSource('renderDecisionChoices');
  assert.match(choose, /\['選択肢1','選択肢2','保留する'\]/);
  assert.match(choose, /data-action="choose-decision"/);
  assert.doesNotMatch(choose, /おすすめ|verdict|save-form|textarea|renderStars/);
  assert.match(fnSource('renderDecision'), /activeSession\.mode === 'two'\) return decideStep==='memo' && selectedDecision \? renderDecisionMemo\(\) : renderDecisionChoices\(\)/);
});

test('ボタンには入力された選択肢の文言を「〜にする」で出す', () => {
  const twoChoiceLabel = new Function('decisionOptionText', 'DECIDE_DECISION',
    `${fnSource('twoChoiceLabel')}; return twoChoiceLabel;`);
  const choiceText = s => s.replace(/選択肢([12])/, (_, n) => `選択肢${'AB'[n - 1]}`);
  const filled = twoChoiceLabel(v => ({ '選択肢1': '今の仕事を続ける', '選択肢2': '転職する' })[v] || '', { choiceText });
  assert.equal(filled('選択肢1'), '『今の仕事を続ける』にする');
  assert.equal(filled('選択肢2'), '『転職する』にする');
  assert.equal(filled('保留する'), '保留にする');
  const blank = twoChoiceLabel(() => '', { choiceText });
  assert.equal(blank('選択肢1'), '選択肢Aにする');
  assert.equal(blank('選択肢2'), '選択肢Bにする');
});

test('選ぶと一言メモ画面へ進み、記録とスキップを選べる', () => {
  assert.match(fnSource('chooseDecision'), /selectedDecision=value; decideStep='memo'; navigate\('decide'\)/);
  const memo = fnSource('renderDecisionMemo');
  assert.match(memo, /一言メモを<wbr>残す/);
  assert.match(memo, /<form id="save-form"/);
  assert.match(memo, /name="memo"/);
  assert.match(memo, /data-save-decision>メモを残して記録する</);
  assert.match(memo, /data-action="skip-memo">残さずにスキップ</);
  assert.match(memo, /data-action="decide-rechoose"/);
  assert.match(app, /action === 'choose-decision'\) chooseDecision\(el\.dataset\.value\)/);
  assert.match(app, /action === 'skip-memo'\) skipDecisionMemo\(el\)/);
});

test('スキップはメモを空にして、いつもの保存処理で記録する', () => {
  const skip = fnSource('skipDecisionMemo');
  assert.match(skip, /form\.elements\.memo\.value=''/);
  assert.match(skip, /decisionDraft\.memo=''/);
  assert.match(skip, /sealDecision\(form,button\)/);
  assert.match(app, /function sealDecision\(form,button=form\.querySelector\('\[data-save-decision\]'\)\)/);
  // 保存される決定の値は従来どおり（既存ログと互換）
  assert.match(fnSource('saveDecision'), /decision:selectedDecision/);
});

test('メモ画面の「戻る」は選び直しに戻り、保存後は最初の段階に戻す', () => {
  assert.match(app, /currentView==='decide' && decideStep==='memo' && activeSession\?\.mode==='two'\)\{ captureDecisionDraft\(\); decideStep='choose'; return navigate\('decide'\); \}/);
  assert.match(app, /decideStep='choose'; navigate\('decide'\); \}/);
  assert.match(fnSource('saveDecision'), /decideStep = 'choose'/);
});

test('1枚引きの決定画面はこれまでどおり', () => {
  const one = fnSource('renderDecision');
  assert.match(one, /const options = \['進む','見送る','保留する'\]/);
  assert.match(one, /data-action="select-decision"/);
  assert.match(one, /決定を記録する/);
});

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

test('2択の比較結果では「DECIDE.」の代わりに3つのボタンを出す', () => {
  assert.match(fnSource('renderReflection'), /if\(activeSession\.mode==='two'\)return renderTwoDecision\(\);/);
  const two = fnSource('renderTwoDecision');
  assert.match(two, /今回は、どうする？/);
  assert.match(two, /\['選択肢1','選択肢2','保留する'\]/);
  assert.match(two, /data-action="choose-decision"/);
  assert.match(two, /\$\{esc\(twoChoiceText\(o\)\)\}/);
  assert.doesNotMatch(two, /data-action="decide"|decideWordmark/);
  // 別の「今回は、どうする？」画面は挟まず、メモ画面だけになる
  assert.match(fnSource('renderDecision'), /activeSession\.mode === 'two'\) return selectedDecision \? renderDecisionMemo\(\) : navigate\('session'\)/);
  assert.equal(app.includes('renderDecisionChoices'), false);
});

test('ボタンには入力された選択肢の文言をそのまま出す', () => {
  const make = name => new Function('decisionOptionText', 'DECIDE_DECISION', `${fnSource(name)}; return ${name};`);
  const choiceText = s => s.replace(/選択肢([12])/, (_, n) => `選択肢${'AB'[n - 1]}`);
  const filled = v => ({ '選択肢1': '引き受ける', '選択肢2': '断る' })[v] || '';
  const text = make('twoChoiceText')(filled, { choiceText });
  assert.equal(text('選択肢1'), '引き受ける');
  assert.equal(text('選択肢2'), '断る');
  assert.equal(text('保留する'), '保留する');
  assert.equal(make('twoChoiceText')(() => '', { choiceText })('選択肢1'), '選択肢A');
  const label = make('twoChoiceLabel')(filled, { choiceText });
  assert.equal(label('選択肢1'), '『引き受ける』にする');
  assert.equal(label('保留する'), '保留にする');
  assert.equal(make('twoChoiceLabel')(() => '', { choiceText })('選択肢2'), '選択肢Bにする');
});

test('選ぶと一言メモ画面へ進み、記録とスキップを選べる', () => {
  const choose = fnSource('chooseDecision');
  assert.match(choose, /selectedDecision=value;/);
  assert.match(choose, /navigate\('decide'\)/);
  const memo = fnSource('renderDecisionMemo');
  assert.match(memo, /一言メモを<wbr>残す/);
  assert.match(memo, /<form id="save-form"/);
  assert.match(memo, /name="memo"/);
  assert.match(memo, /data-save-decision>メモを残して記録する</);
  assert.match(memo, /data-action="skip-memo">残さずにスキップ</);
  assert.match(memo, /data-action="decide-rechoose"/);
  assert.match(app, /action === 'choose-decision'\) chooseDecision\(el\)/);
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

test('メモ画面の「戻る」「選び直す」は比較結果に戻る', () => {
  assert.match(app, /action === 'decide-rechoose'\) \{ captureDecisionDraft\(\); navigate\('session'\); \}/);
  assert.match(app, /if\(currentView==='decide'\)\{ captureDecisionDraft\(\); return navigate\('session'\); \}/);
});

test('1枚引きの決定画面はこれまでどおり', () => {
  const one = fnSource('renderDecision');
  assert.match(one, /const options = \['進む','見送る','保留する'\]/);
  assert.match(one, /data-action="select-decision"/);
  assert.match(one, /決定を記録する/);
});

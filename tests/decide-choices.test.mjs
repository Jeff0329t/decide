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
const make = (name, deps = {}) => new Function(...Object.keys(deps), `${fnSource(name)}; return ${name};`)(...Object.values(deps));
const choiceText = s => s.replace(/選択肢([12])/, (_, n) => `選択肢${'AB'[n - 1]}`);

test('カードの結果では「DECIDE.」の代わりに3つのボタンを出す（チュートリアル以外）', () => {
  assert.match(fnSource('renderReflection'), /if\(!activeSession\.tutorial\)return renderDecisionButtons\(\);/);
  const buttons = fnSource('renderDecisionButtons');
  assert.match(buttons, /今回は、どうする？/);
  assert.match(buttons, /decisionChoices\(\)\.map/);
  assert.match(buttons, /data-action="choose-decision"/);
  assert.match(buttons, /\$\{esc\(decisionChoiceText\(o\)\)\}/);
  assert.doesNotMatch(buttons, /data-action="decide"|decideWordmark/);
  // 別の「今回は、どうする？」画面は挟まず、メモ画面だけになる
  assert.match(fnSource('renderDecision'), /if \(!activeSession \|\| !selectedDecision\) return navigate/);
  assert.match(fnSource('renderDecision'), /renderDecisionMemo\(\);/);
  assert.equal(app.includes('function selectDecision('), false);
});

test('3つの選択肢は、2択ならA・B・保留、1枚引きなら進む・見送る・保留', () => {
  const choices = mode => make('decisionChoices', { activeSession: { mode } })().map(([value]) => value);
  assert.deepEqual(choices('two'), ['選択肢1', '選択肢2', '保留する']);
  assert.deepEqual(choices('one'), ['進む', '見送る', '保留する']);
});

test('2択のボタンには入力された選択肢の文言をそのまま出す', () => {
  const filled = v => ({ '選択肢1': '引き受ける', '選択肢2': '断る' })[v] || '';
  const deps = (mode, optionText) => ({ activeSession: { mode }, decisionOptionText: optionText, DECIDE_DECISION: { choiceText } });
  const text = make('decisionChoiceText', deps('two', filled));
  assert.equal(text('選択肢1'), '引き受ける');
  assert.equal(text('選択肢2'), '断る');
  assert.equal(text('保留する'), '保留する');
  assert.equal(make('decisionChoiceText', deps('two', () => ''))('選択肢1'), '選択肢A');
  assert.equal(make('decisionChoiceText', deps('one', () => ''))('見送る'), '見送る');
  const label = make('decisionChoiceLabel', deps('two', filled));
  assert.equal(label('選択肢1'), '『引き受ける』にする');
  assert.equal(label('保留する'), '保留にする');
  assert.equal(make('decisionChoiceLabel', deps('two', () => ''))('選択肢2'), '選択肢Bにする');
  assert.equal(make('decisionChoiceLabel', deps('one', () => ''))('進む'), '進む');
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

test('メモ画面の「戻る」「選び直す」はカードの結果に戻る', () => {
  assert.match(app, /action === 'decide-rechoose'\) \{ captureDecisionDraft\(\); navigate\('session'\); \}/);
  assert.match(app, /if\(currentView==='decide'\)\{ captureDecisionDraft\(\); return navigate\('session'\); \}/);
});

test('記録したあとは「記録しました」のポップアップを出さない', () => {
  const save = fnSource('saveDecision');
  assert.match(save, /completionId=log\.id; currentView = 'detail'; render\(\);/);
  assert.doesNotMatch(save, /toast\(/);
});

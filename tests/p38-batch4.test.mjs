import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('dist/app.js');
const body = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} がある`);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

function loadPush() {
  const window = { addEventListener() {} };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  vm.runInNewContext(read('dist/push.js'), {
    window, localStorage: storage, console, atob,
    document: { addEventListener() {}, querySelector: () => null }
  });
  return window.DECIDE_PUSH._pure;
}

// #13 決定後は入力内容を要約し「変更する」で開く
test('#13 決定後の入力内容は要約＋変更するボタンで、開くとフォーカスが移る', () => {
  assert.match(app, /class="decision-summary"[\s\S]*?data-decision-summary[\s\S]*?data-action="toggle-decision-meta" aria-expanded="false" aria-controls="decision-meta-editor">変更する</);
  const toggle = body(app, 'toggleDecisionMeta');
  assert.match(toggle, /aria-expanded/);
  assert.match(toggle, /閉じる/);
  assert.match(toggle, /変更する/);
  assert.match(toggle, /\.focus\(/);
});

// #14 2択の準備画面
test('#14 2択の準備は 現在のA/B → 引く → 入力せず引く → 候補 の順', () => {
  const line = app.split('\n').find(l => l.includes('data-action="prepare-skip"'));
  assert.ok(line, '入力せず引く がある');
  const order = ['optionEditor()', 'sameOptionHint()', 'data-action="prepare-next"', 'data-action="prepare-skip">入力せず引く', 'data-pair-candidates'];
  const idx = order.map(s => line.indexOf(s));
  idx.forEach((i, n) => assert.ok(i >= 0, `${order[n]} がある`));
  assert.deepEqual([...idx].sort((a, b) => a - b), idx, '並び順');
  assert.match(app, /action === 'prepare-skip'\) continuePreparation\(true\)/);
  assert.match(app, /スキップして引く/, '1枚引きは従来どおり');
});

test('#14 AとBが同じときは軽いヒントだけ出す（ブロックしない）', () => {
  assert.match(body(app, 'sameOptionHint'), /data-same-option-hint hidden>AとBが同じ内容です。このままでも引けます。/);
  assert.match(body(app, 'updateDraftDisplays'), /data-same-option-hint/);
});

test('#14 候補タップはフォームを作り直さない', () => {
  const select = body(app, 'selectPair');
  assert.match(select, /captureDecisionDraft\(\)/);
  assert.match(select, /restoreDecisionDraft\(\)/);
  assert.doesNotMatch(select, /\brender\(/);
  assert.match(body(app, 'restoreDecisionDraft'), /updateDraftDisplays\(\)/);
  assert.match(body(app, 'updateDraftDisplays'), /aria-pressed/);
});

// #16 通知は1つのセクションと状態行
test('#16 プッシュ通知は常に状態行を出す', () => {
  const { settingHtml, statusLabel } = loadPush();
  for (const mode of ['ios-home', 'login', 'ready']) {
    assert.match(settingHtml(false, mode), /data-push-status>状態：/, mode);
  }
  assert.match(settingHtml(true, 'ready'), /状態：登録済み/);
  assert.match(settingHtml(false, 'ready', 'denied'), /通知がブロックされています/);
  assert.equal(statusLabel('pending'), 'OS許可待ち');
  assert.equal(statusLabel('nope'), 'OFF');
  assert.doesNotMatch(settingHtml(false, 'login'), /data-push-action="toggle"/);
  assert.match(settingHtml(false, 'ready'), /aria-label="ふり返りの通知（アプリを閉じていても届く）" data-push-action="toggle"/);
});

test('#16 通知まわりは「通知」見出しの下にまとまる', () => {
  const reminders = read('dist/reminders.js');
  assert.match(reminders, /<h3 class="notify-group-title" data-notify-group>通知<\/h3>/);
  assert.match(reminders, /aria-label="ふり返りの通知（アプリ内のお知らせ）"/);
  assert.match(read('dist/styles.css'), /\.notify-group-title/);
});

// #18 読み込みは追加取り込みで、件数を見せてから確認
test('#18 読み込み確認は追加取り込みと件数の内訳を示す', () => {
  assert.match(app, /aria-labelledby="import-title"[\s\S]*?<h2 id="import-title">履歴を追加で取り込みますか？<\/h2>/);
  assert.match(app, /「追加取り込み」です[\s\S]*?「完全復元」ではありません/);
  const summary = app.match(/<dl class="import-summary">[\s\S]*?<\/dl>/);
  assert.ok(summary, 'import-summary がある');
  for (const label of ['追加', '更新', '同じ内容', '競合']) assert.match(summary[0], new RegExp(`<dt>${label}`), label);
  assert.match(app, /data-action="confirm-import">取り込む</);
});

// #20 GIS は必要なときだけ読む
test('#20 Google のスクリプトは静的に読み込まない', () => {
  for (const page of ['dist/index.html', 'dist/success.html']) {
    assert.doesNotMatch(read(page), /accounts\.google\.com\/gsi\/client/, page);
  }
  assert.match(read('dist/auth.js'), /GIS_SRC = 'https:\/\/accounts\.google\.com\/gsi\/client'/);
});

// #21 判定の根拠を誤解させない
test('#21 判定カードに目安である旨と「進めやすさとは？」を出す', () => {
  assert.match(app, /<p class="verdict-basis">カードの象徴を比べた目安です。入力した内容を分析したものではありません。<\/p>/);
  assert.match(app, /<details class="score-help"><summary>進めやすさとは？<\/summary><p>[^<]*運勢の良し悪しではありません。/);
  const css = read('dist/styles.css');
  assert.match(css, /\.verdict-basis\s*\{/);
  assert.match(css, /\.score-help/);
});

// #22 同期の状態が分かる
test('#22 同期ONのときは状態行と操作ボタンを出す', () => {
  const sync = read('dist/sync.js');
  assert.match(sync, /data-sync-action="now"[^>]*>今すぐ同期</);
  assert.match(sync, /data-action="export-markdown">バックアップを書き出す</);
  assert.match(sync, /同期中…/);
  assert.match(sync, /最終同期 \$\{fmt\(state\.lastSyncAt\)\}/);
  assert.match(sync, /・未同期 \$\{pending\}件/);
  assert.match(sync, /の同期に失敗しました。通信が戻ると自動でやり直します。/);
  assert.match(sync, /まだ同期していません/);
  assert.match(sync, /OFFにしてもサーバーの内容は残ります（アカウント削除で消えます）/);
});

// #23 アクセシビリティ
test('#23 横向きはヒント表示のみ（操作を塞がない）', () => {
  assert.match(read('dist/index.html'), /class="rotate-lock" role="status"[\s\S]*?縦向きがおすすめです[\s\S]*?横向きのままでも使えます/);
  assert.match(read('dist/styles.css'), /\.rotate-lock \{[^}]*pointer-events: none/);
});

test('#23 1枚引きの山札は中央だけフォーカス可・他は読み上げ対象外', () => {
  assert.match(app, /tabindex="\$\{slot === Math\.floor\(center\) \? '0' : '-1'\}"/);
  assert.match(app, /slot !== Math\.floor\(center\) && !revealed \? ' aria-hidden="true"'/);
});

test('#23 ラベルとトグルの読み上げ', () => {
  assert.match(app, /<textarea id="story-text" aria-label="その後のストーリー"/);
  assert.match(app, /aria-label="タイトルと本文を含める"/);
  assert.match(read('dist/sync.js'), /aria-label="ログの同期（別の端末と決定ログを共有）"/);
});

test('#23 カード裏が1種類のときは選択UIでなく説明文', () => {
  assert.match(app, /<div class="back-single">[\s\S]*?今は1種類です。デザインは今後追加予定です。/);
});

test('#23 設定は目的別の見出しでまとまる', () => {
  assert.match(app, /data-settings-group="card">カードと操作</);
  assert.match(app, /data-settings-group="data">データとアカウント</);
  assert.match(read('dist/styles.css'), /\.settings-group-title/);
});

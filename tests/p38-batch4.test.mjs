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
test('準備のジャンル選択は1枚ならドロー、2枚なら選択肢へ進み、選択肢内の変更では移動しない', () => {
  for (const [mode, view, expected] of [['one','prepare-genre','draw'],['two','prepare-genre','prepare-options'],['two','prepare-options',null]]) {
    const classes=new Set(); const pending=[];
    const screen={isConnected:true,classList:{contains:v=>classes.has(v),add:v=>classes.add(v)}};
    const state={currentView:view,activeSession:{mode},decisionDraft:{genre:'仕事'},document:{querySelector:()=>screen},prefersReducedMotion:()=>false,setTimeout:fn=>pending.push(fn),DECIDE_DECISION:{validGenre:v=>v},captureDecisionDraft(){},restoreDecisionDraft(){},sensoryFeedback(){},navigate:next=>{state.next=next;}};
    vm.runInNewContext(`${body(app,'selectGenre')}\nselectGenre('仕事');`,state);
    assert.equal(state.next,undefined);
    if(view==='prepare-genre') {
      assert.ok(classes.has('is-genre-chosen'));
      vm.runInNewContext("selectGenre('健康');",state);
      assert.equal(pending.length,1);
      pending[0]();
    }
    assert.equal(state.next,expected ?? undefined);
    assert.equal(state.decisionDraft.genre,view==='prepare-genre'?'仕事':'');
  }
  assert.match(body(app,'startSession'), /navigate\('prepare-genre'\)/);
  assert.match(body(app,'navigateBack'), /currentView==='prepare-options'[\s\S]*?navigate\('prepare-genre'\)/);
});

test('#14 準備画面は組合せ候補を常時表示し、スキップと主操作を下部にまとめる', () => {
  assert.match(app, /<section class="prepare-candidates quick-pairs">/);
  assert.doesNotMatch(app, /<details class="prepare-candidates/);
  assert.match(app, /class="prepare-actions"/);
  assert.match(app, /action === 'prepare-skip'\) continuePreparation\(true\)/);
  assert.doesNotMatch(app, /prepare-skip-genre|prepare-genre-filter/);
  assert.doesNotMatch(app, /スキップして引く/);
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

test('#21 結果はおすすめを明示し、補足解説を表示しない', () => {
  const result = app.slice(app.indexOf('function renderSession()'), app.indexOf('function decisionSummaryHtml()'));
  assert.doesNotMatch(result, /verdict-basis|verdict-questions|score-help|verdict-reason|verdict-note|verdict-closing|今回のカードでは/);
  assert.match(result, /is-recommended/);
  assert.match(result, /recommendation-badge/);
});

// #22 同期の状態が分かる
test('#22 同期ONのときは状態行を出し、失敗時に再試行できる', () => {
  const sync = read('dist/sync.js');
  assert.match(sync, /data-sync-action="now"[^>]*>再試行</);
  assert.doesNotMatch(sync, /data-action="export-markdown"/);
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

test('DECIDE confirmation moves once after the stamp settles, and cancels after leaving', () => {
  function harness(reduced=false) {
    const pending=[],destinations=[];
    const button={disabled:false,isConnected:true,setAttribute(){},classList:{add(){}}};
    const context={activeSession:{id:'test'},currentView:'session',sensoryFeedback(){},prefersReducedMotion:()=>reduced,navigate:view=>destinations.push(view),setTimeout:(callback,ms)=>pending.push({callback,ms})};
    vm.createContext(context); vm.runInContext(body(app,'confirmDecisionStep'),context);
    return {context,button,pending,destinations};
  }
  const first=harness();
  first.context.confirmDecisionStep(first.button); first.context.confirmDecisionStep(first.button);
  assert.equal(first.pending.length,1); assert.equal(first.pending[0].ms,420);
  assert.equal(first.destinations.length,0); assert.equal(first.button.disabled,true);
  first.pending[0].callback(); assert.deepEqual(first.destinations,['decide']);
  const left=harness(); left.context.confirmDecisionStep(left.button); left.context.currentView='home'; left.pending[0].callback(); assert.equal(left.destinations.length,0);
  const replaced=harness(); replaced.context.confirmDecisionStep(replaced.button); replaced.context.activeSession={id:'new'}; replaced.pending[0].callback(); assert.equal(replaced.destinations.length,0);
  const reduced=harness(true); reduced.context.confirmDecisionStep(reduced.button); assert.equal(reduced.pending.length,0); assert.deepEqual(reduced.destinations,['decide']);
});

test('low-score comparison omits the recommendation badge and card emphasis', () => {
  const markup={innerHTML:''};
  const nodes=[{card:{name:'A',orientation:'upright'},label:'A'},{card:{name:'B',orientation:'upright'},label:'B'}];
  const context={activeSession:{mode:'two',nodes},app:markup,decisionDraft:{option1:'貯める',option2:'使う'},comparisonVerdict:()=>({scores:[1,2],tie:false,holdRecommended:true,label:'今回は、保留をおすすめします。選ぶなら選択肢Bです。'}),nodeReading:()=>({heading:'意味',body:'本文'}),DECIDE_DECISION:{choiceText:value=>value},esc:value=>value,renderStars:()=>'',cardPicture:()=>'',orientationLabel:()=>'',sessionContext:()=>'',renderReflection:()=>'',renderTutorialStage(){}};
  vm.createContext(context);vm.runInContext(body(app,'renderSession'),context);context.renderSession();
  assert.doesNotMatch(markup.innerHTML,/is-recommended|recommendation-badge/);
  assert.match(markup.innerHTML,/今回は、保留をおすすめします。選ぶなら『使う』です。/);
  context.comparisonVerdict=()=>({scores:[2,3],tie:false,holdRecommended:false,label:'選択肢Bを選択としておすすめします'});
  context.renderSession();assert.match(markup.innerHTML,/is-recommended/);assert.match(markup.innerHTML,/recommendation-badge/);
});

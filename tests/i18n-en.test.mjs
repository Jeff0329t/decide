import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = (rel) => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

test('i18n scripts are loaded in index.html before app.js', () => {
  const html = read('dist/index.html');
  const dictAt = html.indexOf('./i18n-dict.js');
  const i18nAt = html.indexOf('./i18n.js');
  const appAt = html.indexOf('./app.js');
  assert.ok(dictAt > -1 && i18nAt > -1, 'i18n scripts are referenced');
  assert.ok(dictAt < i18nAt && i18nAt < appAt, 'dictionary, then runtime, then app.js');
});

test('i18n runtime: detection order, persistence, settings switch', () => {
  const src = read('dist/i18n.js');
  assert.match(src, /decide\.lang\.v1/);
  assert.match(src, /navigator\.language/);
  assert.match(src, /MutationObserver/);
  assert.match(src, /data-lang-choice/);
  assert.match(src, /DECIDE_I18N/);
});

test('dictionary covers the core flow and the correct free/price facts', () => {
  const context = { window: {} };
  vm.runInNewContext(read('dist/i18n-dict.js'), context);
  const dict = context.window.DECIDE_I18N_DICT;
  assert.ok(Object.keys(dict).length > 600, 'dictionary is substantial');
  for (const key of ['はじめる', '1枚引き', '2枚引き', '進む', '見送る', '保留する', '記録する', '設定', 'カード図鑑', '閉じる', 'キャンセル', 'Googleでログイン']) {
    assert.ok(dict[key], `missing dictionary entry: ${key}`);
  }
  // Free tier is 5 draws / 5 records (not 10); UNLIMITED is a one-time ¥980.
  assert.match(dict['無料プランはドロー5回・ログ保存5件までです。'] || '', /5/);
  assert.match(dict['税込・買い切り'] || '', /one-time/i);
  assert.ok(!JSON.stringify(dict).includes('10回'), 'no stale "10 draws" wording');
});

test('dictionary covers the service-worker update bar', () => {
  const context = { window: {} };
  vm.runInNewContext(read('dist/i18n-dict.js'), context);
  const dict = context.window.DECIDE_I18N_DICT;
  assert.equal(dict['新しいバージョンがあります。'], 'A new version is available');
  assert.equal(dict['更新する'], 'Update');
  assert.equal(dict['閉じる'], 'Close');
});

test('dictionary covers the A2HS help sheet and the detail-screen install banner', () => {
  const context = { window: {} };
  vm.runInNewContext(read('dist/i18n-dict.js'), context);
  const dict = context.window.DECIDE_I18N_DICT;
  for (const key of [
    // help sheet: iOS steps, Chrome steps, in-app-browser note, close aria-label
    'iPhoneでは、Safariから追加できます。',
    '共有ボタン（□に↑）を押す',
    '「ホーム画面に追加」を選ぶ',
    '「追加」を押す',
    'わかった',
    'Chromeのメニュー（⋮）から追加できます。',
    'ブラウザのメニュー（⋮）を開く',
    '「ホーム画面に追加」または「アプリをインストール」を選ぶ',
    '確認画面で追加する',
    'このアプリのメニューから「ブラウザで開く」を選び、SafariやChromeで追加してください。',
    '追加手順を閉じる',
    // detail-screen banner: all three variants, how-to button, close aria-label
    '案内を閉じる',
    'ホーム画面に追加すると、アプリのようにすぐ開けて、記録も消えにくくなります。',
    'この画面では、ホーム画面に追加できません。メニューから『ブラウザで開く』（Safariで開く）を選んでから、追加してください。',
    '記録を消さないために、ホーム画面に追加しておきませんか？　Safariでは、しばらく開かないと記録が消えることがあります。',
    '追加のしかた',
  ]) {
    assert.ok(dict[key], `missing dictionary entry: ${key}`);
  }
  assert.equal(dict['わかった'], 'Got it');
});

test('cards-en.json: all 78 cards, standard English names, full fields', () => {
  const ja = readJson('dist/assets/cards.json');
  const en = readJson('dist/assets/cards-en.json');
  assert.equal(Object.keys(en.cards).length, 78);
  const themeKeys = Object.keys(en.themes);
  assert.deepEqual(themeKeys.sort(), ['blind', 'caution', 'diff', 'letgo', 'want']);
  for (const jc of ja.cards) {
    const ec = en.cards[jc.id];
    assert.ok(ec, `missing English card ${jc.id}`);
    assert.equal(ec.name, jc.en, `${jc.id}: name must be the standard English name`);
    for (const o of ['upright', 'reversed']) {
      assert.equal(ec[o].keywords.length, 3, `${jc.id} ${o} keywords`);
      assert.ok(ec[o].meaning && ec[o].meaning.length > 20, `${jc.id} ${o} meaning`);
      for (const t of themeKeys) assert.ok(ec[o].themes[t], `${jc.id} ${o} theme ${t}`);
    }
    for (const f of ['hint', 'scene', 'check']) assert.ok(ec[f] && ec[f].length > 20, `${jc.id} ${f}`);
    assert.ok(ec.decision && ec.decision.text.length > 20, `${jc.id} decision.text`);
  }
});

test('translation sources are kept in scripts/data and rebuild matches', () => {
  const srcBase = readJson('scripts/data/cards-en.json');
  const srcExtra = readJson('scripts/data/cards-extra-en.json');
  assert.equal(Object.keys(srcBase.cards).length, 78);
  assert.equal(Object.keys(srcExtra).length, 78);
  const jaExtra = {};
  for (const f of ['major', 'wands', 'cups', 'swords', 'pentacles']) {
    Object.assign(jaExtra, readJson(`scripts/data/cards-extra-${f}.json`));
  }
  assert.equal(Object.keys(jaExtra).length, 78);
  for (const id of Object.keys(jaExtra)) {
    assert.equal(srcExtra[id].decision.worry, jaExtra[id].decision.worry, `${id}: decision scene must stay the same`);
  }
});

test('learn-en.json mirrors learn.json structure', () => {
  const ja = readJson('dist/assets/learn.json');
  const en = readJson('dist/assets/learn-en.json');
  const walk = (a, b, path) => {
    assert.equal(typeof b, typeof a, path);
    if (Array.isArray(a)) { assert.equal(b.length, a.length, path); a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`)); return; }
    if (a && typeof a === 'object') for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`);
  };
  walk(ja, en, 'learn');
  assert.equal(en.lessons.length, 6);
});

test('article-titles-en.json covers every article id', () => {
  const rel = readJson('dist/assets/related-articles.json');
  const titles = readJson('dist/assets/article-titles-en.json');
  assert.equal(Object.keys(titles).length, rel.articles.length);
  for (const a of rel.articles) assert.ok(titles[a.id] && titles[a.id].length > 5, a.id);
});

test('English intro page exists at /en/ with the app entry point', () => {
  const html = read('dist/en/index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /doesn’t predict your future/);
  assert.match(html, /¥980/);
  assert.match(html, /no monthly fee/i);
  assert.match(html, /\?lang=en/);
  assert.match(html, /decide\.lang\.v1/);
});

test('dictionary covers every suggestion pair, stats theme strings and all genres', () => {
  const req = createRequire(import.meta.url);
  const meta = req('../dist/decision-meta.js');
  const context = { window: {} };
  vm.runInNewContext(read('dist/i18n-dict.js'), context);
  const dict = context.window.DECIDE_I18N_DICT;
  // Every app-provided option pair must translate as a chip label (A／B)
  // and as the individual values the app writes into the option fields.
  for (const pairs of Object.values(meta.PAIRS)) {
    for (const [a, b] of pairs) {
      assert.ok(dict[a], `missing pair value: ${a}`);
      assert.ok(dict[b], `missing pair value: ${b}`);
      assert.ok(dict[`${a}／${b}`], `missing pair chip: ${a}／${b}`);
    }
  }
  for (const key of ['テーマ別の決断', '一覧を閉じる', '決断を記録すると、よく考えるテーマが見えてきます。', '暮らし・住まい', '健康', '（未入力）', 'どちらも選択としておすすめです', '今回は、保留をおすすめします。', 'ログの同期', '設定を確認しています…']) {
    assert.ok(dict[key], `missing dictionary entry: ${key}`);
  }
});

test('i18n runtime: dynamic sentences, legacy genres, option value translation', () => {
  const src = read('dist/i18n.js');
  // Email reminder sentence carries the account address inline.
  assert.match(src, /選んだ日の夕方（19時ごろ）に、その日の分をまとめて/);
  // Legacy genre names stored in older logs still translate.
  assert.match(src, /'暮らし・住まい': 'Life & home'/);
  assert.match(src, /'健康': 'Health'/);
  // App-filled option values are translated; user editing is left alone.
  assert.match(src, /translateOptionValues/);
  assert.match(src, /#option-1, #option-2/);
  assert.match(src, /document\.activeElement === el/);
  // Composed strings: auto titles, decision text, verdict lines.
  assert.match(src, /選択肢\(\[AB\]\)（/);
  assert.match(src, /「\(\.\+\)」の決断/);
});

test('service worker precaches the i18n files', () => {
  const sw = read('dist/service-worker.js');
  for (const f of ['./i18n.js', './i18n-dict.js', './assets/cards-en.json', './assets/learn-en.json', './assets/article-titles-en.json']) {
    assert.ok(sw.includes(`'${f}'`), `SHELL_FILES missing ${f}`);
  }
});

test('success page has an English variant keyed to the saved language', () => {
  const html = read('dist/success.html');
  assert.match(html, /decide\.lang\.v1/);
  assert.match(html, /Thank you for your purchase/);
});

test('app.js formatDate follows the selected language', () => {
  const src = read('dist/app.js');
  assert.match(src, /DECIDE_I18N\?\.locale\?\.\(\)/);
});

test('i18n runtime: English mode rewrites content-page links to /en/', () => {
  const src = read('dist/i18n.js');
  // The rewrite lives in the English branch only: Japanese mode returns
  // before it is defined, so Japanese links are never touched.
  const jaReturn = src.indexOf("if (lang !== 'en')");
  assert.ok(jaReturn > -1 && src.indexOf('function rewriteHref') > jaReturn, 'rewrite is English-only');
  assert.match(src, /function rewriteHref/);
  assert.match(src, /function rewriteLinks/);
  assert.match(src, /api\.rewriteHref = rewriteHref/);
  // Only the content sections are rewritten; legal pages are excluded.
  assert.match(src, /\(\?:cards\|articles\)\(\?:\\\/\|\$\)/);
  assert.match(src, /about\\\//);
  // Rewriting runs with the translation pass and the observer also watches
  // href, so links rendered or re-targeted later are rewritten too.
  assert.match(src, /rewriteLinks\(root\)/);
  assert.match(src, /rewriteLinks\(document\)/);
  assert.match(src, /attributeFilter: \[\.\.\.ATTRS, 'href'\]/);
});

test('English intro page footer links to the English About page', () => {
  const html = read('dist/en/index.html');
  assert.match(html, /href="\.\/about">About<\/a>/);
  assert.ok(!html.includes('href="../about"'), 'About must not point at the Japanese page');
  // Privacy / Terms have no English version: those links stay as they are.
  assert.match(html, /href="\.\.\/privacy">Privacy<\/a>/);
  assert.match(html, /href="\.\.\/terms">Terms<\/a>/);
});

test('dictionary covers the related-articles tab and reader strings', () => {
  const context = { window: {} };
  vm.runInNewContext(read('dist/i18n-dict.js'), context);
  const dict = context.window.DECIDE_I18N_DICT;
  for (const key of [
    '気になる話から読んでみましょう。',
    '気になる言葉で記事を探す',
    '関連記事を検索',
    '記事のテーマ',
    '← 記事の一覧へ',
    '記事の一覧へ戻る',
    'つづけて読む',
    '記事を読み込んでいます…',
    '記事を読み込めませんでした。',
    '見つかりませんでした。別の言葉で探してみてください。',
  ]) {
    assert.ok(dict[key], `missing dictionary entry: ${key}`);
    assert.ok(!/[぀-ヿ一-鿿]/.test(dict[key]), `dictionary value is not English: ${key}`);
  }
});

test('i18n runtime translates the article count while searching', () => {
  const src = read('dist/i18n.js');
  assert.match(src, /件の記事（「\(\.\+\)」で検索）/);
});

test('learn.js loads the English article data only in English mode', () => {
  const src = read('dist/learn.js');
  assert.match(src, /DECIDE_I18N\.isEn\(\)\?fetch\('\.\/assets\/related-articles-en\.json'\):fetch\('\.\/assets\/related-articles\.json'\)/);
});

test('related-articles-en.json mirrors the Japanese structure with English text', () => {
  const ja = readJson('dist/assets/related-articles.json');
  const en = readJson('dist/assets/related-articles-en.json');
  const titles = readJson('dist/assets/article-titles-en.json');
  const JA_RE = /[぀-ヿ一-鿿]/;
  assert.equal(en.version, ja.version);
  assert.deepEqual(en.categories.map((c) => c.id), ja.categories.map((c) => c.id));
  for (const c of en.categories) assert.ok(c.label && !JA_RE.test(c.label), `category label not English: ${c.id}`);
  assert.equal(en.articles.length, ja.articles.length);
  en.articles.forEach((a, i) => {
    const j = ja.articles[i];
    assert.equal(a.id, j.id);
    assert.equal(a.category, j.category);
    assert.equal(a.minutes, j.minutes);
    assert.equal(a.title, titles[a.id], `title must reuse article-titles-en.json: ${a.id}`);
    assert.deepEqual(a.blocks.map((b) => b.type), j.blocks.map((b) => b.type), `block type order: ${a.id}`);
    assert.ok(a.summary && !JA_RE.test(a.summary), `summary not English: ${a.id}`);
    for (const b of a.blocks) assert.ok(b.text && !JA_RE.test(b.text), `block not English: ${a.id}`);
  });
});

test('service worker precaches the English article data at v280', () => {
  const sw = read('dist/service-worker.js');
  assert.match(sw, /'\.\/assets\/related-articles-en\.json'/);
  assert.match(sw, /decide-shell-editorial-v280/);
});

test('publish47: split-node referral count and composed-string fixes', () => {
  const src = read('dist/i18n.js');
  // referral.js renders "…あと <b>N人</b>": no single text node matches the
  // whole-sentence pattern, so the runtime must translate .referral-count
  // at the element level.
  assert.match(src, /translateReferralCount/);
  assert.match(src, /querySelectorAll\('\.referral-count'\)/);
  // Dedicated patterns must exist for composed strings whose generic
  // patterns under-translate (plan label) or that had no pattern at all.
  assert.match(src, /\^プラン：UNLIMITED（招待特典・/);
  assert.match(src, /\^\(\\d\{1,2\}\)月\(\\d\{1,2\}\)日の決定\$/);
  assert.match(src, /\^「\(\.\+\)」を削除\$/);
  const context = { window: {} };
  vm.runInNewContext(read('dist/i18n-dict.js'), context);
  const dict = context.window.DECIDE_I18N_DICT;
  assert.equal(dict['すべてのカードから選べます'], 'You can choose from all the cards');
});

test('dictionary covers the full-audit leak fixes', () => {
  const context = { window: {} };
  vm.runInNewContext(read('dist/i18n-dict.js'), context);
  const dict = context.window.DECIDE_I18N_DICT;
  for (const key of [
    'はどうでした？',
    '共有する選択肢',
    '実名・会社名は、ここでぼかして送れます。元のログは変わりません。',
    '私が選んだ方',
    '当時のメモはありません。',
    '選択肢と相談のひとことは共有されます。メモは含めません。',
    '選択肢と相談のひとことは共有されます。メモも画像・投稿文・リンク先に含めます。',
    '相談のひとことは共有されます。メモも画像・投稿文・リンク先に含めます。',
    '共有画面を閉じる',
    'まだ決めていない。あなたは？',
    '送ってくれた相手に、LINEやSNSで返信できます。',
    '自分でも引いてみる →',
    'この結果、しっくりきましたか？',
    '選択肢Aを選んだとき',
    '選択肢Bを選んだとき',
    'いま必要な視点',
    '引いたカード',
    '引いたカードと、選んだ言葉',
    '短いメッセージなら送れそう',
    '今日はゆっくり休みたい',
    '明日、もう一度考えたい',
    'ジャンルを選ぶと候補が表示されます。',
    '最近使った選択肢',
    'AとBが同じ内容です。このままでも引けます。',
    'カードを開いています…',
    '2枚のカードを準備しています…',
    '2つの視点を開いています…',
    '押したまま、少し待つ',
    '保留にする',
    '← 最初に戻る',
    'ジャンル',
    'メインナビゲーション',
    'Google でログイン',
    '今は1種類です。デザインは今後追加予定です。',
    '言葉を短くするか、別のキーワードで試してください。',
    '迷わず読める／初めてでも使いやすい',
    '日常の細かい場面までは出にくい',
    '一つの札を、両面から読める',
    '逆位置の読み方に、少し慣れが要る',
    '仕事・お金・人間関係など、日常の具体的な場面が出る',
    '枚数が多く、選ぶのに少し時間がかかる',
    '細やかな読みが得られる',
    '情報量が多く、読むのに時間がかかる',
    'DECIDE. のロゴと「心から納得いく決断を。」のコピー、扉へ続く階段とタロットカードのコラージュ',
    'ファイルとして保存できなかったため、内容をコピーできます。',
    'DECIDE.の履歴バックアップ',
    'DECIDE.のバックアップファイルではありません。',
    '履歴データの形式が正しくありません。',
    '同じ履歴IDが重複しています。',
    'ファイルを読み込めませんでした。',
    'この端末では、記録を保存できない状態です（保存領域がいっぱい、またはブラウザの設定で制限されています）。いま入力した内容は、書き出してお手元に残せます。',
    'この記録を書き出す',
    '保存エラーを閉じる',
    '使えます。',
    'このリンクは読み込めませんでした',
    'リンクが途中で切れているか、古い形式かもしれません。',
    'DECIDE.を使ってみる',
    '本人の選択',
    'DECIDE.とは？',
    'タロットカードをきっかけに、心から納得できる決断を助ける思考ツールです。',
    '自分もカードを引いてみる',
    '操作音・振動をONにしました',
    '操作音・振動をOFFにしました',
    '3日後にまたお聞きします',
    'この端末では保存できませんでした。履歴は変更していません。空き容量やブラウザの設定を確認してください。',
    'この端末では同期をOFFにしました',
    'アカウントを削除しました',
    'アカウントを削除できませんでした',
    'アプリを閉じていても通知を受け取るには、ログインが必要です',
    'メール通知の設定を変更中です。少し待ってください',
    'ログアウトしました',
    'ログインしました',
    'ログインできませんでした',
    'ログインを開始できませんでした',
    'メールのリマインドを止められませんでした',
    '予定を登録できませんでした。通信が戻ると再試行します。',
    '設定を確認できませんでした。再試行してください。',
    '変更を保存できませんでした。もう一度お試しください。',
    'UNLIMITED EDITION（買い切り）',
    '無料',
    '月額料金・追加課金はありません。購入はGoogleアカウントに記録されます。',
    'ログの同期（別の端末と決定ログを共有）',
    '決定ログをサーバーに保存し、同じアカウントでログインした別の端末でも使える機能です（UNLIMITED EDITION限定）。初回ログイン時に自動でONになり、設定でOFFにできます。',
    'OFFにすると以後の同期を止め、この端末の中だけに保存します。OFFにしてもサーバーの内容は残ります（アカウント削除で消えます）。OFFのあいだにこの端末で消した記録は、またONにするとサーバーから戻ります。',
    '同期に失敗した場合は、通信が戻ると自動でやり直します。「再試行」から手動でやり直すこともできます。',
    '別のアカウントでログインしました',
    'この端末の決定ログを、このアカウントにまとめて同期しますか？同期しない場合も、この端末のログはそのまま残ります。',
    'このアカウントに同期する',
    'この端末では同期しない',
    '同期についてを閉じる',
    '招待コード',
    '題名なし',
    'Xにポスト',
    'LINEで送る',
    'Facebookでシェア',
    'Instagramストーリーズにシェア',
    'Google に接続中…',
    '任意 ＋',
    '「',
    '」のカード、メモ、振り返り、ストーリーが削除されます。この操作は元に戻せません。',
    '削除',
    'カード原稿を読み込めませんでした。',
    'カード原稿の形式が正しくありません。',
    '画面を読み直してください。',
  ]) {
    assert.ok(dict[key], `missing dictionary entry: ${key}`);
    assert.ok(!/[぀-ヿ一-鿿]/.test(dict[key]), `dictionary value is not English: ${key}`);
  }
});

test('i18n runtime translates alt attributes and the full-audit composed strings', () => {
  const src = read('dist/i18n.js');
  assert.match(src, /const ATTRS = \['placeholder', 'aria-label', 'title', 'alt'\]/);
  assert.match(src, /\[placeholder\],\[aria-label\],\[title\],\[alt\]/);
  for (const re of [
    /最終書き出し：/,
    /引いたカード：/,
    /選択肢\(\[AB\]\)：\(\.\+\?\) · 選択肢\(\[AB\]\)を選んだとき/,
    /カード1枚と、このときの決定/,
    /選んだ答え：/,
    /私は\(\[AB\]\)を選んだ。あなたは？/,
    /共有する選択肢\(\[AB\]\)/,
    /\(\.\+\)を選びました/,
    /\(\.\+\)を開きました/,
    /選択肢 \?\(\[12\]\)/,
    /このときの決定：/,
    /無料プランはドロー/,
    /前に同期していたアカウントとは別のアカウントです/,
    /ごろにまたお聞きします/,
    /このリンクから始めた人がログインすると/,
  ]) {
    assert.match(src, re, `missing pattern: ${re}`);
  }
});

test('unsubscribe and 404 pages carry their own English scripts', () => {
  const unsub = read('dist/unsubscribe.html');
  assert.match(unsub, /Stop reminder emails/);
  assert.match(unsub, /decide\.lang\.v1/);
  const nf = read('dist/404.html');
  assert.match(nf, /Page not found/);
  assert.match(nf, /'\/en\/cards\/'/);
  assert.match(nf, /'\/en\/cards\/worries'/);
});

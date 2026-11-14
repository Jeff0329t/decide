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

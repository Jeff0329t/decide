import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const STORE_KEY = 'decide.tarot.share-theme.v1';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  };
}

function load(initial = {}) {
  const localStorage = memoryStorage(initial);
  const window = {};
  vm.runInNewContext(read('share-themes.js'), { window, localStorage, document: { addEventListener() {} } });
  return { themes: window.DECIDE_SHARE_THEMES, localStorage };
}

const plain = v => JSON.parse(JSON.stringify(v));
const { normalize, palette, pickerHtml, names } = load().themes._pure;

test('normalize: 知らない名前はクラシックにする', () => {
  assert.deepEqual(plain(names), ['classic', 'yellow', 'paper', 'mono']);
  assert.equal(normalize('paper'), 'paper');
  assert.equal(normalize('red'), 'classic');
  assert.equal(normalize(null), 'classic');
  assert.equal(normalize('toString'), 'classic');
});

test('palette: クラシックはこれまでの黒×黄の色', () => {
  assert.deepEqual(plain(palette('classic')), {
    yellow: '#f1d527', ink: '#0b0b0b', cream: '#f4efe3',
    line: 'rgba(244,239,227,.08)', soft: 'rgba(244,239,227,.6)'
  });
  assert.deepEqual(plain(palette('nope')), plain(palette('classic')));
});

test('pickerHtml: 4色のボタンを出し、選んだものだけ active', () => {
  const html = pickerHtml('mono');
  assert.equal((html.match(/data-share-theme=/g) || []).length, 4);
  assert.match(html, /class="share-theme-chip active" type="button" data-share-theme="mono" aria-pressed="true"/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /ストーリー画像の色/);
});

test('set/current: 選んだテーマを端末に保存する', () => {
  const { themes, localStorage } = load();
  assert.equal(themes.current(), 'classic');
  assert.equal(themes.set('yellow'), 'yellow');
  assert.equal(localStorage.getItem(STORE_KEY), 'yellow');
  assert.equal(themes.current(), 'yellow');
  assert.equal(themes.set('bad'), 'classic');
  assert.equal(load({ [STORE_KEY]: 'paper' }).themes.current(), 'paper');
});

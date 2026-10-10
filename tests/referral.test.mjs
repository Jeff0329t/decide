import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const STORE_KEY = 'decide.tarot.referral.v1';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  };
}

// referral.js を最小限のブラウザ環境で読み込む（未ログイン）
function load({ href = 'https://x.test/', auth } = {}) {
  const localStorage = memoryStorage();
  const replaced = [];
  const url = new URL(href);
  const window = auth ? { DECIDE_AUTH: auth } : {};
  const sandbox = {
    window, localStorage, URL, console,
    document: { addEventListener() {}, querySelector: () => null },
    location: { href, origin: url.origin, pathname: url.pathname },
    history: { state: null, replaceState(state, title, next) { replaced.push(next); } }
  };
  vm.runInNewContext(read('referral.js'), sandbox);
  return { referral: window.DECIDE_REFERRAL, localStorage, replaced };
}

const { normalizeCode, inviteUrl, sectionHtml, countHtml, takeRefFromUrl } = load().referral._pure;
const plain = v => JSON.parse(JSON.stringify(v));

test('normalizeCode: 大文字にそろえ、形がちがうものは空にする', () => {
  assert.equal(normalizeCode(' abcd2345 '), 'ABCD2345');
  assert.equal(normalizeCode('ab'), '');
  assert.equal(normalizeCode('abc-1234'), '');
  assert.equal(normalizeCode(null), '');
});

test('inviteUrl: ?ref=コード 付きのURLを作る', () => {
  assert.equal(inviteUrl('https://decisionprocess.net', '/', 'abcd2345'), 'https://decisionprocess.net/?ref=ABCD2345');
  assert.equal(inviteUrl('https://decisionprocess.net', '/', '<x>'), '');
});

test('sectionHtml: コードがあればボタン、なければ準備中', () => {
  const html = sectionHtml('ABCD2345', 'https://x.test/?ref=ABCD2345');
  assert.match(html, /data-referral-section/);
  assert.match(html, /招待コード <b>ABCD2345<\/b>/);
  assert.match(html, /data-referral-action="share"/);
  assert.match(html, /data-referral-action="copy"/);
  assert.match(sectionHtml('', ''), /準備しています/);
  assert.doesNotMatch(sectionHtml('', ''), /data-referral-action/);
});

test('countHtml: 招待人数と残り枠（5人まで）', () => {
  assert.equal(countHtml(null), '');
  assert.match(countHtml(0), /招待した人 <b>0人<\/b>.*あと <b>5人<\/b>/);
  assert.match(countHtml(3), /招待した人 <b>3人<\/b>.*あと <b>2人<\/b>/);
  assert.match(countHtml(5), /上限（5人）に達しました/);
  assert.match(countHtml(7), /招待した人 <b>7人<\/b>.*上限/);
  assert.match(sectionHtml('ABCD2345', 'u', 2), /referral-count/);
  assert.doesNotMatch(sectionHtml('ABCD2345', 'u'), /referral-count/);
});

test('takeRefFromUrl: ref を取り出し、ほかのパラメータは残す', () => {
  assert.deepEqual(plain(takeRefFromUrl('https://x.test/app/?ref=abcd2345&a=1#top')), { code: 'ABCD2345', cleaned: '/app/?a=1#top' });
  assert.deepEqual(plain(takeRefFromUrl('https://x.test/?ref=%3Cbad%3E')), { code: '', cleaned: '/' });
  assert.deepEqual(plain(takeRefFromUrl('https://x.test/?a=1')), { code: '', cleaned: '' });
  assert.deepEqual(plain(takeRefFromUrl('not a url')), { code: '', cleaned: '' });
});

test('読み込み時: ?ref= を保存してアドレスバーから消す', () => {
  const { referral, localStorage, replaced } = load({ href: 'https://x.test/?ref=abcd2345' });
  assert.equal(referral.pendingCode(), 'ABCD2345');
  assert.equal(localStorage.getItem(STORE_KEY), 'ABCD2345');
  assert.deepEqual(replaced, ['/']);
  const none = load();
  assert.equal(none.referral.pendingCode(), '');
  assert.equal(none.replaced.length, 0);
});

test('renderSettings: 未ログインは何も出さない', () => {
  assert.equal(load().referral.renderSettings(), '');
  assert.equal(load({ auth: { getUser: () => null } }).referral.renderSettings(), '');
});

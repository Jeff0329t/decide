import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const DRAFTS_KEY = 'decide.storyDrafts.v1';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  };
}

// 下書き・保存ヘルパー部分だけを app.js から切り出して実行する
const helperBlock = source.slice(source.indexOf("const STORY_DRAFTS_KEY"), source.indexOf('function setReview'));

function load({ stored, persistOk = true, throwing = false } = {}) {
  const sessionStorage = throwing
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }
    : memoryStorage(stored === undefined ? {} : { [DRAFTS_KEY]: stored });
  const sandbox = { sessionStorage, persistCalls: 0, persistOk, Date, JSON, Object, Map, String, Array };
  vm.runInNewContext(`function persist(){ persistCalls++; return persistOk; }\n${helperBlock}\nthis.api={setStoryDraft,storyDraftFor,clearStoryDraft,commitLogChange,writeRemind,REMIND_KEYS};`, sandbox);
  return { ...sandbox.api, sessionStorage, sandbox };
}

test('下書きは sessionStorage に保存され、再読込後も復元される', () => {
  const first = load();
  first.setStoryDraft('a', '書きかけ', '');
  assert.equal(first.storyDraftFor('a'), '書きかけ');
  const raw = first.sessionStorage.getItem(DRAFTS_KEY);
  assert.deepEqual(JSON.parse(raw), { a: '書きかけ' });
  const second = load({ stored: raw });
  assert.equal(second.storyDraftFor('a'), '書きかけ');
  assert.equal(second.storyDraftFor('b'), null);
});

test('保存済み本文と同じ下書きは破棄され、clear で消える', () => {
  const app = load();
  app.setStoryDraft('a', '同じ', '同じ');
  assert.equal(app.storyDraftFor('a'), null);
  app.setStoryDraft('a', '', '');
  assert.equal(app.storyDraftFor('a'), null);
  app.setStoryDraft('a', '新しい', '古い');
  app.setStoryDraft('b', '別', '');
  app.clearStoryDraft('a');
  assert.equal(app.storyDraftFor('a'), null);
  assert.deepEqual(JSON.parse(app.sessionStorage.getItem(DRAFTS_KEY)), { b: '別' });
  app.clearStoryDraft('b');
  assert.equal(app.sessionStorage.getItem(DRAFTS_KEY), null);
});

test('壊れた JSON や使えない sessionStorage でも落ちず、メモリ上で下書きを保持する', () => {
  for(const stored of ['{broken', '[1,2]', '{"a":3,"b":"ok"}']) {
    const app = load({ stored });
    assert.equal(app.storyDraftFor('a'), null);
  }
  assert.equal(load({ stored: '{"a":3,"b":"ok"}' }).storyDraftFor('b'), 'ok');
  const blocked = load({ throwing: true });
  blocked.setStoryDraft('a', 'メモリだけ', '');
  assert.equal(blocked.storyDraftFor('a'), 'メモリだけ');
});

test('commitLogChange は保存失敗時に元の値へ戻し、無かったキーは削除する', () => {
  const app = load({ persistOk: false });
  const log = { id: 'a', story: '元', updatedAt: 'u0' };
  const saved = app.commitLogChange(log, ['story', 'storyUpdatedAt', 'updatedAt'], item => { item.story = '新'; item.storyUpdatedAt = item.updatedAt = 'u1'; });
  assert.equal(saved, false);
  assert.equal(app.sandbox.persistCalls, 1);
  assert.deepEqual({ ...log }, { id: 'a', story: '元', updatedAt: 'u0' });
  assert.equal('storyUpdatedAt' in log, false);
});

test('commitLogChange は保存成功時に変更を残す', () => {
  const app = load();
  const log = { id: 'a' };
  assert.equal(app.commitLogChange(log, ['review'], item => { item.review = '良かった'; }), true);
  assert.equal(log.review, '良かった');
});

test('writeRemind は毎回 remindUpdatedAt を ISO で刻み、解除は明示的な null にする', () => {
  const app = load();
  const log = { id: 'a' };
  app.writeRemind(log, '2026-10-20T00:00:00.000Z', 3);
  assert.equal(log.remindAt, '2026-10-20T00:00:00.000Z');
  assert.equal(log.remindDays, 3);
  assert.match(log.remindUpdatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(log.updatedAt, log.remindUpdatedAt);
  app.writeRemind(log, null, null);
  assert.ok('remindAt' in log && log.remindAt === null);
  assert.equal(log.remindDays, null);
  assert.match(log.remindUpdatedAt, /Z$/);
  assert.deepEqual([...app.REMIND_KEYS], ['remindAt', 'remindDays', 'remindUpdatedAt', 'updatedAt']);
});

test('保存失敗時のリマインド変更は remindUpdatedAt ごと元に戻る', () => {
  const app = load({ persistOk: false });
  const log = { id: 'a', remindAt: 'x', remindDays: 7, remindUpdatedAt: 'old', updatedAt: 'old' };
  assert.equal(app.commitLogChange(log, app.REMIND_KEYS, item => app.writeRemind(item, null, null)), false);
  assert.deepEqual({ ...log }, { id: 'a', remindAt: 'x', remindDays: 7, remindUpdatedAt: 'old', updatedAt: 'old' });
});

// 以下は DOM 依存で Node では動かせない UI 経路の文字列確認
test('UI 経路: 下書きの復元・入力・旧関数の撤去', () => {
  assert.match(source, /storyDraftFor\(log\.id\)/);
  assert.match(source, /event\.target\.id === 'story-text' && detailId\)\{ setStoryDraft\(/);
  assert.doesNotMatch(source, /renderDetailKeepingDraft/);
  assert.match(source, /if\(saved\)clearStoryDraft\(id\)|saved\)\s*clearStoryDraft\(id\)/);
});

test('UI 経路: 削除は保存成功後にだけ墓標を送る', () => {
  const body = source.slice(source.indexOf('function deleteLog'), source.indexOf('function deleteLog') + 600);
  const failIndex = body.indexOf('if(!persist()){ logs=before;');
  assert.ok(failIndex > 0);
  assert.ok(body.indexOf('markDeleted') > failIndex);
});

test('UI 経路: 振り返り期限モーダルと WebMCP は保存失敗を成功扱いしない', () => {
  assert.match(source, /commitLogChange\(log,REMIND_KEYS,item=>writeRemind\(item,null,null\)\)/);
  assert.match(source, /commitLogChange\(log,REMIND_KEYS,item=>writeRemind\(item,new Date\(Date\.now\(\)\+3\*DAY_MS\)\.toISOString\(\),3\)\)/);
  assert.match(source, /status:'error',error:'save_failed'/);
  assert.match(source, /log\.remindUpdatedAt=new Date\(\)\.toISOString\(\)/);
});

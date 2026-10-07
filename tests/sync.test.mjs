import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const STORE_KEY = 'decide.tarot.sync.v1';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  };
}

// sync.js を最小限のブラウザ環境で読み込む（自動同期が走らないよう auth は isEnabled=false）
function load({ user = null, pro = false, cloudSync = false } = {}) {
  const localStorage = memoryStorage();
  const settings = { cloudSync };
  const window = {
    DECIDE_AUTH: { isEnabled: () => false, getUser: () => user },
    DECIDE_ENTITLEMENTS: { hasProAccess: () => pro },
    DECIDE_APP_BRIDGE: { getLogs: () => [], getSettings: () => settings },
    addEventListener() {}
  };
  const sandbox = {
    window, localStorage, console, setTimeout, clearTimeout,
    document: { addEventListener() {}, querySelector: () => null }
  };
  vm.runInNewContext(read('sync.js'), sandbox);
  return { sync: window.DECIDE_SYNC, localStorage };
}

const log = (id, createdAt, extra = {}) => ({ id, createdAt, nodes: [], ...extra });
const { merge } = load().sync._pure;
const plain = v => JSON.parse(JSON.stringify(v));

test('merge: 端末だけのログはアップロード、サーバーだけのログは取り込む', () => {
  const r = merge([log('a', '2026-10-01T00:00:00Z')], [{ id: 'b', data: log('b', '2026-10-02T00:00:00Z'), deleted: false }], []);
  assert.deepEqual(plain(r.logs.map(l => l.id)), ['b', 'a']);
  assert.deepEqual(plain(r.upload).map(u => u.id), ['a']);
});

test('merge: 新しい方が勝つ（振り返りがある方）', () => {
  const local = log('a', '2026-10-01T00:00:00Z');
  const remote = log('a', '2026-10-01T00:00:00Z', { reviewedAt: '2026-10-03T00:00:00Z' });
  const r = merge([local], [{ id: 'a', data: remote, deleted: false }], []);
  assert.equal(r.logs[0].reviewedAt, '2026-10-03T00:00:00Z');
  assert.equal(r.upload.length, 0);
  const r2 = merge([remote], [{ id: 'a', data: local, deleted: false }], []);
  assert.deepEqual(plain(r2.upload).map(u => u.id), ['a']);
});

test('merge: 端末で消したログは墓標として送る', () => {
  const r = merge([], [{ id: 'a', data: log('a', '2026-10-01T00:00:00Z'), deleted: false }], ['a']);
  assert.equal(r.logs.length, 0);
  assert.deepEqual(plain(r.upload), [{ id: 'a', data: null, deleted: true }]);
});

test('merge: サーバーで消されたログは端末からも消す', () => {
  const r = merge([log('a', '2026-10-01T00:00:00Z')], [{ id: 'a', data: null, deleted: true }], []);
  assert.equal(r.logs.length, 0);
  assert.equal(r.upload.length, 0);
});

test('merge: 壊れたデータは無視する', () => {
  const r = merge([{ id: 'x' }, log('a', '2026-10-01T00:00:00Z')], [{ id: 'b', data: { bad: true }, deleted: false }], []);
  assert.deepEqual(plain(r.logs.map(l => l.id)), ['a']);
});

test('markDeleted: 同期ONのときだけ墓標を記録する', () => {
  const off = load({ cloudSync: false });
  off.sync.markDeleted('a');
  assert.equal(off.localStorage.getItem(STORE_KEY), null);
  const on = load({ cloudSync: true });
  on.sync.markDeleted('a');
  assert.deepEqual(JSON.parse(on.localStorage.getItem(STORE_KEY)).tombstones, ['a']);
});

test('renderToggle: 未ログインは表示なし、PROはON表示、無料はPRO限定の案内', () => {
  assert.equal(load().sync.renderToggle(), '');
  const user = { id: 'u1' };
  const pro = load({ user, pro: true, cloudSync: true }).sync.renderToggle();
  assert.match(pro, /ログの同期/);
  assert.match(pro, /aria-pressed="true"/);
  const free = load({ user, pro: false, cloudSync: true }).sync.renderToggle();
  assert.match(free, /PRO限定/);
  assert.match(free, /aria-pressed="false"/);
});

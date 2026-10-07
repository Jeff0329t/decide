import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const STORE_KEY = 'decide.tarot.remind.v1';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  };
}

// reminders.js を最小限のブラウザ環境で読み込む（indexedDB・navigator なし）
function load({ stored = null, notification = false } = {}) {
  const localStorage = memoryStorage(stored ? { [STORE_KEY]: stored } : {});
  const window = { addEventListener() {} };
  const sandbox = {
    window, localStorage, console,
    document: { addEventListener() {}, querySelector: () => null }
  };
  if(notification) sandbox.Notification = { permission: 'default', requestPermission: async () => 'denied' };
  vm.runInNewContext(read('reminders.js'), sandbox);
  return window.DECIDE_REMINDERS;
}

const plain = v => JSON.parse(JSON.stringify(v));
const { dueItems, defaultRemindAt, pendingItems } = load()._pure;

test('defaultRemindAt: ONなら3日後、OFFや壊れた日時は null', () => {
  assert.equal(defaultRemindAt('2026-10-01T00:00:00.000Z', true), '2026-10-04T00:00:00.000Z');
  assert.equal(defaultRemindAt('2026-10-01T00:00:00.000Z', false), null);
  assert.equal(defaultRemindAt('こわれた日付', true), null);
});

test('pendingItems: ふり返り前で予定のあるログの {id, remindAt} だけ', () => {
  const logs = [
    { id: 'a', remindAt: '2026-10-04T00:00:00Z', question: '秘密の悩み' },
    { id: 'b', remindAt: '2026-10-04T00:00:00Z', review: { result: 'good' } },
    { id: 'c' },
    { id: '', remindAt: '2026-10-04T00:00:00Z' },
    null
  ];
  assert.deepEqual(plain(pendingItems(logs)), [{ id: 'a', remindAt: '2026-10-04T00:00:00Z' }]);
  assert.deepEqual(plain(pendingItems('x')), []);
});

test('dueItems: 予定時刻を過ぎて、まだ通知していないものだけ', () => {
  const logs = [
    { id: 'a', remindAt: '2026-10-04T00:00:00Z' },
    { id: 'b', remindAt: '2026-10-10T00:00:00Z' },
    { id: 'c', remindAt: '2026-10-03T00:00:00Z' }
  ];
  assert.deepEqual(plain(dueItems(logs, '2026-10-05T00:00:00Z', ['c'])).map(i => i.id), ['a']);
  assert.deepEqual(plain(dueItems(logs, Date.parse('2026-10-11T00:00:00Z'), [])).map(i => i.id), ['a', 'b', 'c']);
});

test('renderToggle: 保存した状態でON/OFF、通知に対応していない端末は案内', () => {
  const off = load({ notification: true });
  assert.equal(off.isOn(), false);
  assert.match(off.renderToggle(), /aria-pressed="false"/);
  assert.match(off.renderToggle(), /決定から3日後/);
  assert.equal(off.defaultRemindAt('2026-10-01T00:00:00Z'), null);

  const on = load({ stored: '{"enabled":true}', notification: true });
  assert.equal(on.isOn(), true);
  assert.match(on.renderToggle(), /aria-pressed="true"/);
  assert.equal(on.defaultRemindAt('2026-10-01T00:00:00.000Z'), '2026-10-04T00:00:00.000Z');

  assert.match(load().renderToggle(), /通知に対応していません/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  };
}

// push.js を最小限のブラウザ環境で読み込む
function load({ auth, config } = {}) {
  const localStorage = memoryStorage();
  const window = { addEventListener() {} };
  if(auth) window.DECIDE_AUTH = auth;
  if(config) window.DECIDE_CONFIG = config;
  const sandbox = {
    window, localStorage, console, atob,
    document: { addEventListener() {}, querySelector: () => null }
  };
  vm.runInNewContext(read('push.js'), sandbox);
  return { push: window.DECIDE_PUSH, localStorage };
}

const { urlBase64ToUint8Array, sanitizeItems, settingHtml } = load().push._pure;
const plain = v => JSON.parse(JSON.stringify(v));

test('urlBase64ToUint8Array: base64url をバイト列にする', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array('-_8')], [251, 255]);
});

test('sanitizeItems: 形のちがうものを落とし、重複を消して新しい順にする', () => {
  const items = sanitizeItems([
    { id: 'a', remindAt: '2026-10-01T00:00:00Z' },
    { id: 'b', remindAt: '2026-10-05T00:00:00+09:00' },
    { id: 'a', remindAt: '2026-10-09T00:00:00Z' },
    { id: '', remindAt: '2026-10-01T00:00:00Z' },
    { id: 'x'.repeat(101), remindAt: '2026-10-01T00:00:00Z' },
    { id: 'c', remindAt: 'not a date' },
    { id: 1, remindAt: '2026-10-01T00:00:00Z' },
    null
  ]);
  assert.deepEqual(plain(items), [
    { id: 'b', remindAt: '2026-10-04T15:00:00.000Z' },
    { id: 'a', remindAt: '2026-10-01T00:00:00.000Z' }
  ]);
  assert.deepEqual(plain(sanitizeItems(null)), []);
});

test('sanitizeItems: 最大500件', () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ id: `id${i}`, remindAt: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() }));
  const out = sanitizeItems(many);
  assert.equal(out.length, 500);
  assert.equal(out[0].id, 'id599');
});

test('settingHtml: iPhoneでホーム画面に追加していないときは案内だけ', () => {
  const html = settingHtml(false, 'ios-home');
  assert.match(html, /data-push-setting/);
  assert.match(html, /ホーム画面に追加/);
  assert.doesNotMatch(html, /data-push-action/);
});

test('settingHtml: ON/OFF ボタンを出す', () => {
  const off = settingHtml(false, 'ready');
  assert.match(off, /data-push-action="toggle" aria-pressed="false"/);
  assert.match(off, /<b>OFF<\/b>/);
  assert.match(off, /決定ごとに選んだ日/);
  const on = settingHtml(true, 'ready');
  assert.match(on, /class="toggle-button on"/);
  assert.match(on, /aria-pressed="true"/);
});

test('renderSettings: 公開鍵なしでは何も出さない・未ログインならログインの案内', () => {
  const user = { getUser: () => ({ id: 'u' }), client: () => ({}) };
  assert.equal(load().push.renderSettings(), '');
  const loggedOut = load({ config: { VAPID_PUBLIC_KEY: 'AQID' } }).push.renderSettings();
  assert.match(loggedOut, /data-push-setting/);
  assert.match(loggedOut, /ログインが必要/);
  assert.doesNotMatch(loggedOut, /data-push-action/);
  assert.equal(load({ auth: user, config: { VAPID_PUBLIC_KEY: '' } }).push.renderSettings(), '');
});

test('statusLabel: 状態ごとの表示', () => {
  const { statusLabel } = load().push._pure;
  assert.equal(statusLabel('login'), 'ログインが必要');
  assert.equal(statusLabel('ios-home'), 'ホーム画面への追加が必要');
  assert.equal(statusLabel('unsupported'), 'この端末は非対応');
  assert.equal(statusLabel('denied'), '通知がブロックされています');
  assert.equal(statusLabel('failed'), '登録失敗');
  assert.equal(statusLabel('registered'), '登録済み');
  assert.equal(statusLabel('off'), 'OFF');
});

test('isOn: はじめは OFF', () => {
  assert.equal(load().push.isOn(), false);
});

test('メール移行後は設定・再登録・予定同期を止め、旧購読を解除する', async () => {
  const calls = [];
  const storage = memoryStorage({ 'decide.tarot.push.v1': '{"enabled":true,"ownerId":"u"}' });
  const sub = { endpoint: 'https://push.example.test/old', unsubscribe: async () => { calls.push('unsubscribe'); return true; } };
  const online = {};
  const window = {
    DECIDE_CONFIG: { PUSH_REMINDERS_ENABLED: false, VAPID_PUBLIC_KEY: 'AQID' },
    DECIDE_AUTH: { getUser: () => ({ id: 'u' }), client: () => ({ rpc: async (name, args) => { calls.push([name, args.endpoint]); return {}; } }) },
    addEventListener: (name, fn) => { online[name] = fn; },
    PushManager: function() {}
  };
  vm.runInNewContext(read('push.js'), {
    window, localStorage: storage, console, atob,
    navigator: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) } },
    Notification: { permission: 'granted' },
    document: { addEventListener() {}, querySelector: () => null }
  });
  await online.online();
  assert.equal(window.DECIDE_PUSH.isOn(), false);
  assert.equal(window.DECIDE_PUSH.renderSettings(), '');
  await window.DECIDE_PUSH.toggle();
  assert.equal(await window.DECIDE_PUSH.syncNow(), false);
  assert.deepEqual(calls, [['delete_push_subscription', sub.endpoint], 'unsubscribe']);
  assert.equal(JSON.parse(storage.getItem('decide.tarot.push.v1')).enabled, false);
});

// sync.js を Node の vm で実際に動かし、同期の流れ（送信・中断・アカウント切替）を確かめる
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../dist/sync.js', import.meta.url), 'utf8');
const STORE_KEY = 'decide.tarot.sync.v1';
const flush = async (n = 10) => { for(let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const log = (id, at, extra = {}) => ({ id, createdAt: at, updatedAt: at, nodes: [], ...extra });

function memoryStorage() {
  const data = new Map();
  return { data, getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: k => { data.delete(k); } };
}

// サーバー（全ユーザー共通）。hold=true のあいだ upsert は deferred で止まる
function server() {
  const srv = { rows: [], upserts: [], hold: false, pending: [] };
  srv.client = () => ({
    from: () => ({
      select: () => ({ eq: (_c, uid) => ({ range: async () => ({ data: srv.rows.filter(r => r.user_id === uid).map(({ id, data, deleted }) => ({ id, data, deleted })), error: null }) }) }),
      upsert: async rows => {
        srv.upserts.push(rows);
        if(srv.hold) { const d = deferred(); srv.pending.push(d); await d.promise; }
        for(const r of rows) { srv.rows = srv.rows.filter(x => !(x.user_id === r.user_id && x.id === r.id)); srv.rows.push(r); }
        return { error: null };
      }
    })
  });
  return srv;
}

// 端末1台ぶん（storage と logs/settings を共有すれば「再読み込み」になる）
function device() { return { storage: memoryStorage(), logs: [], settings: { cloudSync: false } }; }

function boot(dev, srv, { user = null, pro = true } = {}) {
  let current = user;
  const listeners = [];
  const calls = { setLogs: 0, persist: 0, render: 0 };
  let clickHandler = null;
  const nodes = [];
  const window = {
    DECIDE_AUTH: {
      isEnabled: () => true, getUser: () => current, client: () => srv.client(),
      onChange: fn => listeners.push(fn), ready: async () => current, renderSettings() {}
    },
    DECIDE_ENTITLEMENTS: { hasProAccess: () => pro, refresh: async () => {}, openPaywall() {} },
    DECIDE_APP_BRIDGE: {
      getLogs: () => dev.logs, setLogs: v => { calls.setLogs++; dev.logs = v; }, getSettings: () => dev.settings,
      persist: () => { calls.persist++; if(!window.__applying) window.DECIDE_SYNC?.schedule?.(); }, render: () => { calls.render++; }
    },
    addEventListener() {}
  };
  const document = {
    addEventListener: (type, fn) => { if(type === 'click') clickHandler = fn; },
    querySelector: sel => nodes.find(n => `#${n.id}` === sel) || null,
    createElement: () => { const n = { id: '', innerHTML: '', remove: () => { const i = nodes.indexOf(n); if(i >= 0) nodes.splice(i, 1); } }; return n; },
    body: { appendChild: n => { nodes.push(n); } }
  };
  const sandbox = { window, localStorage: dev.storage, console: { warn() {}, log() {} }, setTimeout, clearTimeout, document, navigator: { onLine: true } };
  vm.runInNewContext(SRC, sandbox);
  const click = action => clickHandler({ target: { closest: () => ({ dataset: { syncAction: action } }) }, preventDefault() {} });
  const setUser = u => { if((u?.id || null) === (current?.id || null)) return; current = u; listeners.forEach(fn => fn(u)); };
  const confirmOpen = () => nodes.some(n => n.id === 'sync-account-modal');
  return { sync: window.DECIDE_SYNC, calls, click, setUser, confirmOpen, state: () => JSON.parse(dev.storage.getItem(STORE_KEY) || '{}') };
}

test('(a) OFF のとき syncNow しても止まらず、ON にした後の syncNow は実際に送る', async () => {
  const dev = device(); const srv = server();
  dev.logs = [log('l1', '2026-10-01T00:00:00Z')];
  dev.storage.setItem(STORE_KEY, JSON.stringify({ autoOn: true, lastUserId: 'A' }));
  const s = boot(dev, srv, { user: { id: 'A' } });
  await flush();
  assert.equal(await s.sync.syncNow(), false);
  assert.equal(srv.upserts.length, 0);
  dev.settings.cloudSync = true;
  assert.equal(await s.sync.syncNow(), true);
  assert.equal(srv.upserts.length, 1);
  assert.equal(JSON.stringify(srv.upserts[0].map(r => [r.user_id, r.id])), JSON.stringify([['A', 'l1']]));
});

test('(b) 同期のあと（送信中も含む）に編集したログは未同期として数える', async () => {
  const dev = device(); const srv = server();
  dev.logs = [log('l1', '2026-10-01T00:00:00Z')];
  dev.settings.cloudSync = true;
  dev.storage.setItem(STORE_KEY, JSON.stringify({ autoOn: true, lastUserId: 'A' }));
  const s = boot(dev, srv, { user: { id: 'A' } });
  await flush();
  assert.equal(s.sync._pure.unsyncedCount(dev.logs, s.state()), 0);
  // 同期後の編集
  dev.logs = [{ ...dev.logs[0], updatedAt: new Date(Date.now() + 1000).toISOString() }];
  assert.ok(s.sync._pure.unsyncedCount(dev.logs, s.state()) > 0);
  // 送信待ちのあいだの編集も、最終同期より後として数える
  srv.hold = true;
  const job = s.sync.syncNow();
  await flush();
  assert.equal(srv.pending.length, 1);
  await new Promise(r => setTimeout(r, 5));
  dev.logs = [...dev.logs, log('l2', new Date().toISOString())];
  srv.pending[0].resolve();
  await job;
  assert.ok(s.sync._pure.unsyncedCount(dev.logs, s.state()) >= 1);
});

test('(c) upsert 待ちのあいだにログアウトしたら、結果をログに書き戻さない', async () => {
  const dev = device(); const srv = server();
  dev.logs = [log('l1', '2026-10-01T00:00:00Z')];
  dev.settings.cloudSync = true;
  dev.storage.setItem(STORE_KEY, JSON.stringify({ autoOn: true, lastUserId: 'A' }));
  srv.rows = [{ user_id: 'A', id: 'r1', data: log('r1', '2026-09-01T00:00:00Z'), deleted: false }];
  srv.hold = true;
  const s = boot(dev, srv, { user: { id: 'A' } });
  await flush();
  assert.equal(srv.pending.length, 1);
  const before = { ...s.calls }; const stateBefore = s.state();
  s.setUser(null);
  srv.pending[0].resolve();
  await flush();
  assert.equal(s.calls.setLogs, before.setLogs);
  assert.equal(s.calls.persist, before.persist);
  assert.equal(dev.logs.map(l => l.id).join(), 'l1');
  assert.equal(s.state().lastSyncAt, stateBefore.lastSyncAt);
  // 「同期中…」のまま残らない
  assert.equal(await s.sync.syncNow(), false);
});

test('(d) A→OFF→B→ON→再読み込みでも、明示的に引き継ぐまで A のログを B として送らない', async () => {
  const dev = device(); const srv = server();
  dev.logs = [log('a1', '2026-10-01T00:00:00Z')];
  dev.settings.cloudSync = true;
  dev.storage.setItem(STORE_KEY, JSON.stringify({ autoOn: true, lastUserId: 'A' }));
  let s = boot(dev, srv, { user: { id: 'A' } });
  await flush();
  assert.equal(srv.upserts.length, 1);
  s.click('toggle'); await flush();               // OFF
  assert.equal(dev.settings.cloudSync, false);
  s.setUser(null); s.setUser({ id: 'B' }); await flush();
  assert.equal(s.state().lastUserId, 'A');         // OFF でも持ち主は A のまま
  s.click('toggle'); await flush();               // ON にしようとすると確認が出る
  assert.ok(s.confirmOpen());
  dev.settings.cloudSync = true;                    // 仮に ON のまま再読み込みされても
  s = boot(dev, srv, { user: { id: 'B' } });
  await flush();
  await s.sync.syncNow(); await flush();
  assert.equal(srv.upserts.length, 1);
  assert.ok(!srv.rows.some(r => r.user_id === 'B'));
  assert.ok(s.confirmOpen());
  // 明示的に引き継いだら B として送る
  s.click('account-merge'); await flush();
  assert.equal(s.state().lastUserId, 'B');
  assert.ok(srv.rows.some(r => r.user_id === 'B' && r.id === 'a1'));
});

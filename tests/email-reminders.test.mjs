import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = fs.readFileSync(new URL('../dist/email-reminders.js', import.meta.url), 'utf8');
const flush = async () => { for(let i=0;i<15;i++) await Promise.resolve(); };
async function load({ configured = true, on = false } = {}) {
  let user = { id: 'alice', email: 'alice@example.test' }, change;
  const calls = [], timers = new Map(), storage = new Map(), messages = [];
  let fail = false, logs = [], timerId = 0;
  const client = { async rpc(name, args) {
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    if(fail) return { error: new Error('offline') };
    if(name === 'get_email_reminder_setting') return { data: on };
    on = args.enabled;
    return { error: null };
  } };
  const window = {
    DECIDE_CONFIG: { EMAIL_REMINDERS_ENABLED: configured },
    DECIDE_AUTH: { getUser: () => user, client: () => client, ready: () => Promise.resolve(user), onChange: fn => { change = fn; } },
    DECIDE_APP_BRIDGE: { getLogs: () => logs }, addEventListener() {}
  };
  vm.runInNewContext(source, { window, document: { addEventListener() {}, querySelector: () => null },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
    crypto: { randomUUID }, setTimeout: fn => { const id = ++timerId; timers.set(id,fn); return id; }, clearTimeout: id => timers.delete(id),
    toast: msg => messages.push(msg)
  });
  await flush();
  return { api: window.DECIDE_EMAIL_REMINDERS, calls, messages, timers,
    setFail: v => { fail=v; }, setLogs: v => { logs=v; },
    changeUser: async v => { user=v; await change(v); await flush(); },
    runTimers: async () => { const work=[...timers.values()]; timers.clear(); for(const fn of work) fn(); await flush(); }
  };
}

test('mail stays unavailable until configured; no server calls or false ON state', async () => {
  const h=await load({configured:false});
  await h.api.toggle();
  assert.equal(h.api.isOn(),false); assert.equal(h.calls.length,0);
  assert.match(h.api.renderSettings(), /準備中/);
  assert.doesNotMatch(h.api.renderSettings(), /data-email-remind-action="toggle"/);
});
test('opt-in uploads only pending id/time, excluding review, private text and invalid dates', async () => {
  const h=await load();
  h.setLogs([{id:'a',remindAt:'2026-11-01T10:00:00+09:00',memo:'SECRET'},
    {id:'b',remindAt:'2026-11-01',review:'良かった'}, {id:'bad',remindAt:'invalid'}]);
  await h.api.toggle();
  assert.equal(h.api.isOn(),true);
  assert.deepEqual(h.calls.at(-1).args.items,[{id:'a',remindAt:'2026-11-01T01:00:00.000Z'}]);
  assert.doesNotMatch(JSON.stringify(h.calls), /SECRET/);
});
test('review, cancellation and deletion replace the device snapshot; unchanged snapshots are skipped', async () => {
  const h=await load(); h.setLogs([{id:'a',remindAt:'2026-11-01'}]); await h.api.toggle();
  const before=h.calls.length;
  await h.api.syncNow(); assert.equal(h.calls.length,before);
  h.setLogs([{id:'a',remindAt:null}]); await h.api.syncNow();
  assert.deepEqual(h.calls.at(-1).args.items,[]);
});
test('failed ON remains OFF; failed OFF remains ON with a visible error', async () => {
  const h=await load(); h.setFail(true); await h.api.toggle(); assert.equal(h.api.isOn(),false);
  h.setFail(false); await h.api.toggle(); assert.equal(h.api.isOn(),true);
  h.setFail(true); await h.api.toggle(); assert.equal(h.api.isOn(),true);
  assert.match(h.api.renderSettings(),/変更を保存できませんでした/);
});
test('failed schedule sync retries without losing a cancellation', async () => {
  const h=await load(); h.setLogs([{id:'a',remindAt:'2026-11-01'}]); await h.api.toggle();
  h.setLogs([]); h.setFail(true); await h.api.syncNow();
  assert.ok(h.timers.size>0);
  h.setFail(false); await h.runTimers();
  assert.deepEqual(h.calls.at(-1).args.items,[]);
});
test('account switch gets a new device binding and does not enroll automatically', async () => {
  const h=await load(); await h.api.toggle(); const first=h.calls.at(-1).args.device;
  await h.api.disableForSignOut();
  await h.changeUser({id:'bob',email:'bob@example.test'});
  assert.equal(h.api.isOn(),false); assert.notEqual(h.calls.at(-1).args.device,first);
});
test('sign-out must cancel server schedules; failure is surfaced instead of claiming OFF', async () => {
  const h=await load(); await h.api.toggle(); h.setFail(true);
  assert.equal(await h.api.disableForSignOut(),false); assert.equal(h.api.isOn(),true);
  h.setFail(false); assert.equal(await h.api.disableForSignOut(),true);
  assert.equal(h.calls.at(-1).args.enabled,false); assert.deepEqual(h.calls.at(-1).args.items,[]);
});
test('known OFF setting never blocks sign-out during a network failure or creates an unnecessary enrollment', async () => {
  const h=await load(); const before=h.calls.length; h.setFail(true);
  assert.equal(await h.api.disableForSignOut(),true); assert.equal(h.calls.length,before);
});
test('a large history fails explicitly rather than silently dropping scheduled reminders', async () => {
  const h=await load(); h.setLogs(Array.from({length:501},(_,i)=>({id:`id${i}`,remindAt:'2026-11-01'})));
  await h.api.toggle(); assert.equal(h.api.isOn(),false);
  assert.equal(h.calls.filter(c=>c.name==='set_email_reminders').length,0);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const body = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = src.indexOf('\n  function ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

test('#8 通知の宛先は持ち主を覚え、ログアウト時に外す', () => {
  const push = read('dist/push.js');
  assert.match(push, /ownerId/);
  assert.match(push, /async function disableForSignOut\(\)/);
  assert.match(push, /async function checkOwner\(user\)/);
  assert.match(push, /disableForSignOut,/);
});

test('#8 ログアウト・アカウント削除はセッションがあるうちに通知の宛先を外す', () => {
  const auth = read('dist/auth.js');
  for(const name of ['signOut', 'deleteAccount']) {
    const fn = body(auth, name);
    const off = fn.indexOf('disableForSignOut');
    const out = fn.indexOf('client.auth.signOut');
    assert.ok(off >= 0 && out > off, `${name}: disableForSignOut must run before signOut`);
  }
});

test('#8 予定は端末（endpoint）ごとに持ち、ほかの端末の予定に触れない', () => {
  const sql = read('supabase/migrations/20261012000000_push_device_scope.sql');
  assert.match(sql, /push_reminders_endpoint_fkey/);
  assert.match(sql, /on delete cascade/);
  assert.match(sql, /primary key \(user_id, endpoint, log_id\)/);
  assert.match(sql, /unknown subscription/);
  assert.match(sql, /drop function if exists public\.set_push_reminders\(jsonb\)/);
  assert.match(sql, /grant execute on function public\.set_push_reminders\(jsonb, text\) to authenticated/);
  assert.match(sql, /revoke execute on function public\.set_push_reminders\(jsonb, text\) from anon/);
  assert.match(sql, /pr\.endpoint = e and not/);
});

test('#9 別アカウントでログインしたら同期を止めて確認する', () => {
  const sync = read('dist/sync.js');
  assert.match(sync, /lastUserId/);
  assert.match(sync, /sync-account-modal/);
  assert.match(sync, /data-sync-action="account-merge"/);
  assert.match(sync, /data-sync-action="account-keep"/);
  assert.match(sync, /function resolveAccount\(/);
  assert.match(sync, /const accountOk = user =>/);
});

test('#3 開いている決済セッションがあれば作り直さずに返す', () => {
  const src = read('supabase/functions/create-checkout/index.ts');
  const find = src.indexOf('await findOpenSession(');
  const create = src.indexOf('stripe.checkout.sessions.create(');
  assert.ok(find >= 0 && create > find);
  assert.match(src, /status: 'open'/);
  assert.match(src, /s\.metadata\?\.user_id === userId/);
  assert.match(src, /s\.metadata\?\.product === PRODUCT_KEY/);
  assert.match(src, /startsWith\(`\$\{base\}\/`\)/);
});

test('#11 購入を1件ずつ記録し、利用者からは読めない', () => {
  const sql = read('supabase/migrations/20261012010000_purchases.sql');
  assert.match(sql, /checkout_session_id text primary key/);
  assert.match(sql, /payment_intent text unique/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.purchases from anon/);
  assert.match(sql, /revoke all on public\.purchases from authenticated/);
});

test('#11 二重購入を通知し、片方の返金ではPROを外さない', () => {
  const src = read('supabase/functions/stripe-webhook/index.ts');
  assert.match(src, /from\('purchases'\)\.upsert/);
  assert.match(src, /ignoreDuplicates: true \}\);/);
  assert.match(src, /二重購入の可能性/);
  const refund = src.slice(src.indexOf('async function onChargeRefunded'), src.indexOf('async function onDispute'));
  assert.match(refund, /status: 'refunded'/);
  const count = refund.indexOf("count: 'exact'");
  const free = refund.indexOf("plan_type: 'free'");
  assert.ok(count >= 0 && free > count);
});

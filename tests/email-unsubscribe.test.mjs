import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(`../dist/${name}`, import.meta.url), 'utf8');
const token = '3f2c9c1e-5b7a-4d0e-9a11-2b6c8d4e0f17';
function load() {
  const window = { DECIDE_CONFIG: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-key' } };
  vm.runInNewContext(read('unsubscribe.js'), { window, fetch: () => { throw Error('use fetchImpl'); }, URL });
  return window.DECIDE_UNSUBSCRIBE;
}
const reply = (body, status = 200) => async (url, options) => { reply.last = { url, options }; return { ok: status < 300, json: async () => body }; };

test('the stop link token is read from ?t= and rejected unless it is a UUID', () => {
  const api = load();
  assert.equal(api.takeToken(`https://decisionprocess.net/unsubscribe?t=${token}`), token);
  assert.equal(api.takeToken('https://decisionprocess.net/unsubscribe?t=../../x'), '');
  assert.equal(api.takeToken('https://decisionprocess.net/unsubscribe'), '');
});
test('stopping posts only the token to the public RPC with the anon key', async () => {
  const api = load();
  assert.equal(await api.unsubscribe(token, { fetchImpl: reply(true) }), 'done');
  assert.equal(reply.last.url, 'https://example.supabase.co/rest/v1/rpc/email_unsubscribe');
  assert.equal(reply.last.options.method, 'POST');
  assert.deepEqual(JSON.parse(reply.last.options.body), { token });
  assert.equal(reply.last.options.headers.apikey, 'anon-key');
});
test('unknown token, server error and offline are told apart', async () => {
  const api = load();
  assert.equal(await api.unsubscribe(token, { fetchImpl: reply(false) }), 'invalid');
  assert.equal(await api.unsubscribe(token, { fetchImpl: reply({}, 500) }), 'error');
  assert.equal(await api.unsubscribe(token, { fetchImpl: async () => { throw Error('offline'); } }), 'error');
  assert.equal(await api.unsubscribe('nope', { fetchImpl: reply(true) }), 'invalid');
});
test('the page never stops on open: only the button sends, and the token leaves the address bar', () => {
  const html = read('unsubscribe.html');
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /data-action="unsubscribe"/);
  const js = read('unsubscribe.js');
  assert.match(js, /history\.replaceState\(null, '', location\.pathname\)/);
  assert.ok(js.indexOf('await unsubscribe(token)') > js.indexOf("addEventListener('click'"));
  assert.doesNotMatch(read('sitemap.xml'), /unsubscribe/);
});
test('every reminder email carries the stop link; the old device-only instruction is gone', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261023000000_email_unsubscribe.sql', import.meta.url), 'utf8');
  assert.match(sql, /site_url \|\| '\/unsubscribe\?t=' \|\| t\.token::text/);
  assert.doesNotMatch(sql, /登録した端末の設定で/);
  assert.match(sql, /grant execute on function public\.email_unsubscribe\(uuid\) to anon, authenticated/);
  assert.match(sql, /revoke all on function public\.stop_all_email_reminders_\(uuid\) from public, anon, authenticated/);
});
test('success page pins supabase-js with an integrity hash like the app', () => {
  const tag = html => html.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"[^>]*>/)?.[0];
  const success = tag(read('success.html'));
  assert.match(success, /supabase-js@\d+\.\d+\.\d+\//);
  assert.match(success, /integrity="sha384-[A-Za-z0-9+/=]+"/);
  assert.match(success, /crossorigin="anonymous"/);
  assert.equal(success.match(/@[\d.]+\//)[0], tag(read('index.html')).match(/@[\d.]+\//)[0]);
});

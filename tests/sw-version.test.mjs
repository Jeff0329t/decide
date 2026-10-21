import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { readServiceWorker, shellCacheName, shellFingerprint, shellTextFiles } from '../scripts/lib/sw-fingerprint.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/sw-shell-fingerprint.json', import.meta.url), 'utf8'));
const sw = readServiceWorker();

test('cache-first shell files changed => SHELL_CACHE must be bumped (残件A regression)', () => {
  const now = shellFingerprint(sw);
  if (now.sha256 === fixture.sha256) {
    assert.equal(now.cache, fixture.cache, 'shell files unchanged but SHELL_CACHE differs from fixture: run `node scripts/update-sw-fingerprint.mjs`');
    return;
  }
  assert.notEqual(now.cache, fixture.cache,
    `Cache-first shell files (${now.files.join(', ')}) changed but SHELL_CACHE is still '${now.cache}'. ` +
    'Existing users would never receive the new code. Bump SHELL_CACHE in dist/service-worker.js ' +
    '(e.g. decide-shell-editorial-vN+1), then run `node scripts/update-sw-fingerprint.mjs`.');
  assert.fail(`SHELL_CACHE was bumped to '${now.cache}' but tests/fixtures/sw-shell-fingerprint.json is stale. ` +
    'Run `node scripts/update-sw-fingerprint.mjs` to record the new fingerprint.');
});

test('shell cache is at least v125 and fingerprint covers the core code files', () => {
  assert.ok(Number(shellCacheName(sw).match(/decide-shell-editorial-v(\d+)$/)?.[1]) >= 125);
  const files = shellTextFiles(sw);
  for (const path of ['index.html', 'app.js', 'auth.js', 'sync.js', 'styles.css', 'config.js']) assert.ok(files.includes(path), path);
});

async function runActivate(existing) {
  const handlers = {};
  const deleted = [];
  let pending;
  const context = {
    URL, Request: class { constructor(url) { this.url = url; } }, Response,
    self: {
      registration: { scope: 'https://example.test/app/' },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      clients: { claim: async () => {} }
    },
    caches: {
      keys: async () => [...existing],
      delete: async name => { deleted.push(name); return true; }
    },
    localStorage: new Proxy({}, { get() { throw new Error('SW must not touch localStorage'); } }),
    indexedDB: new Proxy({}, { get() { throw new Error('activate must not touch IndexedDB'); } })
  };
  vm.runInNewContext(sw, context);
  handlers.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  return deleted;
}

test('activate removes only old decide-shell-* caches and keeps the image cache and current shell', async () => {
  const current = shellCacheName(sw);
  const deleted = await runActivate([
    current, 'decide-shell-editorial-v124', 'decide-shell-editorial-v1',
    'decide-card-images-p14-v1', 'unrelated-cache'
  ]);
  assert.deepEqual(deleted.sort(), ['decide-shell-editorial-v1', 'decide-shell-editorial-v124']);
});

test('update path never clears drafts/logs (localStorage) or the decide-remind IndexedDB', () => {
  assert.doesNotMatch(sw, /localStorage|sessionStorage/);
  assert.doesNotMatch(sw, /deleteDatabase|\.clear\(\)/);
  assert.match(sw, /const IMAGE_CACHE = 'decide-card-images-p14-v1'/);
});

function fetchHandler() {
  const handlers = {};
  const context = {
    URL, Request: class { constructor(url) { this.url = url; } }, Response,
    self: {
      registration: { scope: 'https://decisionprocess.net/' },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      clients: { claim: async () => {} }
    },
    caches: { match: async () => undefined },
    fetch: async () => new Response('')
  };
  vm.runInNewContext(sw, context);
  return path => {
    let answered = false;
    handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://decisionprocess.net' + path }, respondWith: () => { answered = true; } });
    return answered;
  };
}

test('navigation answers the app shell only for the scope root', () => {
  const navigate = fetchHandler();
  for (const path of ['/', '/?from=ar00', '/index.html']) assert.equal(navigate(path), true, path);
  for (const path of ['/privacy', '/terms', '/tokushoho', '/success?session_id=abc', '/privacy.html', '/no-such-page', '/cards/ar00', '/cards/foo/bar']) {
    assert.equal(navigate(path), false, path);
  }
});

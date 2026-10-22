import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const dist = new URL('../dist/', import.meta.url);
const headers = fs.readFileSync(new URL('_headers', dist), 'utf8');
const csp = headers.match(/^\s+Content-Security-Policy: (.+)$/m)?.[1] || '';
const directive = name => (csp.split(';').map(part => part.trim().split(/\s+/)).find(([key]) => key === name) || []).slice(1);
const pages = fs.readdirSync(dist, { recursive: true }).filter(path => String(path).endsWith('.html'))
  .map(path => [String(path), fs.readFileSync(new URL(String(path), dist), 'utf8')]);

test('_headers はすべてのページに CSP とセキュリティヘッダーを付ける', () => {
  assert.match(headers, /^\/\*$/m);
  for(const name of ['X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff', 'Referrer-Policy:', 'Permissions-Policy:', 'Strict-Transport-Security:']) {
    assert.ok(headers.includes(name), name);
  }
  assert.deepEqual(directive('object-src'), ["'none'"]);
  assert.deepEqual(directive('frame-ancestors'), ["'none'"]);
  assert.ok(!directive('script-src').includes("'unsafe-inline'"));
  assert.ok(!directive('script-src').includes("'unsafe-eval'"));
});

// ページに埋め込みのスクリプトを足したり変えたりしたら、そのハッシュを _headers の script-src に足す（なければ本番で動かない）
test('ページ内のスクリプトはすべて CSP のハッシュで許可されている', () => {
  const allowed = new Set(directive('script-src'));
  const missing = new Set();
  for(const [path, html] of pages) {
    for(const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if(/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs)) continue;
      const hash = `'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`;
      if(!allowed.has(hash)) missing.add(`${hash} (${path})`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('読み込む外部スクリプトと通信先は CSP で許可されている', () => {
  const scriptSrc = directive('script-src');
  for(const [path, html] of pages) {
    for(const [, src] of html.matchAll(/<script\b[^>]*\bsrc="(https:[^"]+)"/g)) {
      assert.ok(scriptSrc.some(source => source.startsWith('https://') && src.startsWith(source)), `${src} (${path})`);
    }
  }
  const auth = fs.readFileSync(new URL('auth.js', dist), 'utf8');
  const gis = auth.match(/GIS_SRC = '([^']+)'/)[1];
  assert.ok(scriptSrc.some(source => gis.startsWith(source)));
  const config = fs.readFileSync(new URL('config.js', dist), 'utf8');
  const supabase = config.match(/SUPABASE_URL: '([^']+)'/)[1];
  assert.ok(directive('connect-src').includes(supabase));
  assert.ok(directive('connect-src').includes(supabase.replace('https://', 'wss://')));
});

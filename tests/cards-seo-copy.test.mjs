import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cardsSeo, seoForPath, updateSeoHead } from '../scripts/lib/cards-seo.mjs';

const dir = new URL('../dist/cards/', import.meta.url);
test('every card HTML has unique editorial metadata and synchronized social previews', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  assert.deepEqual(Object.keys(cardsSeo).sort(), files);
  for (const file of files) {
    const html = readFileSync(new URL(file, dir), 'utf8');
    const { title, description } = seoForPath(`/cards/${file === 'index.html' ? '' : file.replace(/\.html$/, '')}`);
    assert.equal(html.match(/<title>(.*?)<\/title>/s)?.[1], title, file);
    for (const [key, value] of Object.entries({ description, 'og:title': title, 'og:description': description, 'twitter:title': title, 'twitter:description': description })) {
      const tags = [...html.matchAll(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)">`, 'g'))];
      assert.equal(tags.length, 1, `${file} ${key}`);
      assert.equal(tags[0][1], value, `${file} ${key}`);
    }
    assert.match(title, /タロット/, file);
    if (/^(ar|cu|wa|sw|pe)\d/.test(file)) {
      const name = html.match(/<h1>(.*?)の意味<\/h1>/)?.[1];
      assert.ok(title.startsWith(`${name}の意味と`), file);
    }
    assert.equal(updateSeoHead(html, cardsSeo[file]), html, `${file} idempotent`);
  }
  assert.equal(seoForPath('/articles/example'), null);
  assert.throws(() => seoForPath('/cards/missing'), /Missing SEO/);
});

test('metadata updater adds missing tags, removes duplicates, escapes copy and preserves page behavior', () => {
  const page = '<html><head><title>old</title><title>duplicate</title><meta name="description" content="old"><meta name="description" content="duplicate"><style>body{color:red}</style><script>window.ready=true;</script></head><body><h1>Keep</h1></body></html>';
  const copy = { title: 'A & B', description: 'A "quote" <hint>' };
  const result = updateSeoHead(page, copy);
  assert.equal(result.match(/<title>/g).length, 1);
  assert.equal(result.match(/name="description"/g).length, 1);
  assert.match(result, /A &amp; B/);
  assert.match(result, /A &quot;quote&quot; &lt;hint&gt;/);
  assert.match(result, /<style>body\{color:red\}<\/style><script>window.ready=true;<\/script>/);
  assert.ok(result.endsWith('<body><h1>Keep</h1></body></html>'));
  assert.equal(updateSeoHead(result, copy), result);
  assert.throws(() => updateSeoHead('<body>no head</body>', copy), /exactly one head/);
});

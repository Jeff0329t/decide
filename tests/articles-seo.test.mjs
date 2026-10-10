import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, safeHref, parseFrontMatter, loadArticles } from '../scripts/lib/markdown.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ids = [
  ...Array.from({ length: 22 }, (_, i) => `ar${String(i).padStart(2, '0')}`),
  ...['wa', 'cu', 'sw', 'pe'].flatMap((s) => Array.from({ length: 14 }, (_, i) => `${s}${String(i + 1).padStart(2, '0')}`)),
];
const worries = ['tenshoku', 'wakare', 'hikkoshi', 'kekkon', 'manabi', 'dokuritsu', 'ningen', 'okane', 'renai', 'shukatsu', 'kaigo', 'fukugyo'];
const CTA = '今抱えている迷いを、このカードの視点から考えてみる';
const ARTICLES_SRC = fileURLToPath(new URL('../scripts/data/articles/', import.meta.url));
const ARTICLES_DIST = fileURLToPath(new URL('../dist/articles/', import.meta.url));

test('markdown escapes raw HTML and only allows safe links', () => {
  const { html } = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](/cards/ar00.html) [z](https://example.com/a)\n\n<!-- メモ -->');
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<a href="\.\.\/cards\/ar00\.html">y<\/a>/);
  assert.match(html, /<a href="https:\/\/example\.com\/a">z<\/a>/);
  assert.doesNotMatch(html, /メモ/);
  assert.equal(safeHref('//evil.example'), null);
  assert.equal(safeHref('data:text/html,x'), null);
  assert.equal(safeHref('/x" onclick="y'), null);
});

test('markdown renders headings, lists and quotes', () => {
  const { blocks } = renderMarkdown('## 見出し\n\n本文**太字**\n\n- a\n- b\n\n1. c\n\n> 引用');
  assert.deepEqual(blocks.map((b) => b.type), ['h2', 'p', 'list', 'list', 'quote']);
  assert.match(blocks[1].html, /<strong>太字<\/strong>/);
});

test('front matter parses arrays, booleans and quotes', () => {
  const { data, body } = parseFrontMatter('---\nslug: a-b\ncards: [ar00, cu08]\ndraft: true\ntitle: "x: y"\n---\n本文');
  assert.deepEqual(data, { slug: 'a-b', cards: ['ar00', 'cu08'], draft: true, title: 'x: y' });
  assert.equal(body, '本文');
});

test('loadArticles rejects bad front matter and hides drafts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decide-articles-')) + '/';
  const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`).join('\n')}\n---\n## a\n本文\n`;
  const ok = { slug: 'ok', title: 't', h1: 'h', description: 'd', date: '2026-10-08', keyword: 'k', primary: 'cu08', worries: ['tenshoku'], cards: ['ar00'], draft: false };
  const opts = { worrySlugs: worries, cardIds: ids };
  const expectThrow = (over, re) => {
    writeFileSync(dir + 'a.md', fm({ ...ok, ...over }));
    assert.throws(() => loadArticles(dir, opts), re);
  };
  try {
    assert.deepEqual(loadArticles(dir + 'missing/', opts), []);
    expectThrow({ slug: 'Bad_Slug' }, /bad slug/);
    expectThrow({ date: '2026/10/08' }, /YYYY-MM-DD/);
    expectThrow({ primary: 'xx01' }, /unknown card/);
    expectThrow({ worries: ['nope'] }, /unknown worry/);
    expectThrow({ draft: 'yes' }, /draft must be/);
    expectThrow({ title: '' }, /"title" is required/);
    writeFileSync(dir + 'a.md', fm(ok));
    writeFileSync(dir + 'b.md', fm(ok));
    assert.throws(() => loadArticles(dir, opts), /duplicate slug/);
    writeFileSync(dir + 'b.md', fm({ ...ok, slug: 'dr', draft: true }));
    assert.deepEqual(loadArticles(dir, opts).map((a) => a.slug), ['ok']);
    assert.deepEqual(loadArticles(dir, { ...opts, drafts: true }).map((a) => a.slug).sort(), ['dr', 'ok']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const published = loadArticles(ARTICLES_SRC, { worrySlugs: worries, cardIds: ids });
const drafts = loadArticles(ARTICLES_SRC, { drafts: true, worrySlugs: worries, cardIds: ids }).filter((a) => a.draft);

test('source articles are valid and drafts meet the writing guide', () => {
  for (const a of drafts) {
    assert.ok(a.text.length >= 1500, `${a.slug} ${a.text.length} chars`);
    assert.ok(a.blocks.filter((b) => b.type === 'h2').length >= 2, `${a.slug} h2 count`);
  }
});

test('normal build does not publish drafts', () => {
  const sm = read('dist/sitemap.xml');
  for (const a of drafts) {
    assert.ok(!existsSync(ARTICLES_DIST + `${a.slug}.html`), `draft page ${a.slug} must not be built`);
    assert.doesNotMatch(sm, new RegExp(`/articles/${a.slug}\\.html`), a.slug);
  }
  if (existsSync(ARTICLES_DIST)) {
    for (const f of readdirSync(ARTICLES_DIST).filter((x) => x.endsWith('.html'))) {
      const html = read(`dist/articles/${f}`);
      assert.doesNotMatch(html, /noindex/, f);
      assert.doesNotMatch(html, /下書き/, f);
    }
  }
  if (!published.length) {
    assert.doesNotMatch(sm, /\/articles\//);
    assert.doesNotMatch(read('dist/cards/index.html'), /href="\.\.\/articles\//);
  }
});

function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

test('published articles have SEO essentials, CTAs, OGP and no JS', () => {
  const sm = read('dist/sitemap.xml');
  if (published.length) {
    assert.match(sm, /<loc>https:\/\/decisionprocess\.net\/articles\/<\/loc>/);
    const idx = read('dist/articles/index.html');
    for (const a of published) assert.match(idx, new RegExp(`href="\\./${a.slug}\\.html"`), a.slug);
  }
  for (const a of published) {
    const html = read(`dist/articles/${a.slug}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://decisionprocess\\.net/articles/${a.slug}\\.html"`), a.slug);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, a.slug);
    assert.match(html, /"@type":\s*"Article"/, a.slug);
    assert.match(html, /"@type":\s*"BreadcrumbList"/, a.slug);
    const h2s = a.blocks.filter((b) => b.type === 'h2').length;
    assert.equal(html.split(CTA).length - 1, h2s >= 2 ? 2 : 1, `${a.slug} CTA count`);
    const froms = [...html.matchAll(/href="\.\.\/\?from=([^"]+)"/g)].map((m) => m[1]);
    for (const f of froms) assert.ok(ids.includes(f), `${a.slug} from=${f}`);
    assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)/, a.slug);
    assert.doesNotMatch(html, /sk_live|sk_test|whsec_|service_role/, a.slug);
    assert.match(sm, new RegExp(`<loc>https://decisionprocess\\.net/articles/${a.slug}\\.html</loc>`), a.slug);
    const m = html.match(/property="og:image" content="([^"]+)"/);
    assert.ok(m, a.slug);
    const jpg = new URL(m[1].replace('https://decisionprocess.net/', '../dist/'), import.meta.url);
    assert.ok(existsSync(jpg), `${a.slug} → ${m[1]}（node scripts/build-og.mjs --only=article-${a.slug}）`);
    const buf = readFileSync(jpg);
    assert.deepEqual(jpegSize(buf), { w: 1200, h: 630 }, a.slug);
    assert.ok(buf.length < 250 * 1024, `${a.slug} ${buf.length} bytes`);
  }
});

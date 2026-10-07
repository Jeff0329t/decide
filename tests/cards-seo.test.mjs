import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ids = [
  ...Array.from({ length: 22 }, (_, i) => `ar${String(i).padStart(2, '0')}`),
  ...['wa', 'cu', 'sw', 'pe'].flatMap((s) => Array.from({ length: 14 }, (_, i) => `${s}${String(i + 1).padStart(2, '0')}`)),
];
const CTA = '今抱えている迷いを、このカードの視点から考えてみる';

test('78 card pages and index exist', () => {
  assert.equal(ids.length, 78);
  assert.ok(existsSync(new URL('../dist/cards/index.html', import.meta.url)));
  for (const id of ids) assert.ok(existsSync(new URL(`../dist/cards/${id}.html`, import.meta.url)), id);
});

test('each card page has SEO essentials, CTAs, credit and alt', () => {
  for (const id of ids) {
    const html = read(`dist/cards/${id}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://decisionprocess\\.net/cards/${id}\\.html"`), id);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, id);
    assert.match(html, /property="og:title"/, id);
    assert.match(html, /name="twitter:card"/, id);
    assert.match(html, /"@type":\s*"Article"/, id);
    assert.match(html, /"@type":\s*"BreadcrumbList"/, id);
    assert.equal(html.split(CTA).length - 1, 2, `${id} CTA count`);
    assert.match(html, /images: sixseeds\/tarot-api, public domain/, id);
    assert.match(html, /<img [^>]*alt="[^"]+"/, id);
    assert.match(html, /決断・迷いにおけるヒント/, id);
    assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)/, `${id} must not need JS`);
  }
});

test('app index is indexable and links to cards', () => {
  const html = read('dist/index.html');
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /href="\.\/cards\/"/);
});

test('service worker bypasses /cards/ and is bumped', () => {
  const sw = read('dist/service-worker.js');
  assert.match(sw, /decide-shell-editorial-v79/);
  assert.match(sw, /url\.pathname\.includes\('\/cards\/'\)/);
});

test('sitemap and robots', () => {
  const sm = read('dist/sitemap.xml');
  assert.ok((sm.match(/<loc>/g) || []).length >= 80);
  assert.match(read('dist/robots.txt'), /^Sitemap: https:\/\/decisionprocess\.net\/sitemap\.xml$/m);
});

test('no secrets in card pages', () => {
  for (const id of ids) assert.doesNotMatch(read(`dist/cards/${id}.html`), /sk_live|sk_test|whsec_|service_role/, id);
});

const cats = { ar: 'major', wa: 'wands', cu: 'cups', sw: 'swords', pe: 'pentacles' };

test('category pages exist with SEO essentials and one CTA', () => {
  for (const slug of Object.values(cats)) {
    const html = read(`dist/cards/${slug}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://decisionprocess\\.net/cards/${slug}\\.html"`), slug);
    assert.match(html, /"@type":\s*"BreadcrumbList"/, slug);
    assert.match(html, /"@type":\s*"ItemList"/, slug);
    assert.equal(html.split(CTA).length - 1, 1, `${slug} CTA count`);
    assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)/, slug);
  }
});

test('card pages link to their category and neighbours', () => {
  for (const id of ids) {
    const html = read(`dist/cards/${id}.html`);
    assert.match(html, new RegExp(`href="\\./${cats[id.slice(0, 2)]}\\.html"`), id);
    if (id !== 'ar00') assert.match(html, /rel="prev"/, id);
    if (id !== 'pe14') assert.match(html, /rel="next"/, id);
  }
  const idx = read('dist/cards/index.html');
  for (const slug of Object.values(cats)) assert.match(idx, new RegExp(`href="\\./${slug}\\.html"`), slug);
});

test('sitemap includes category pages', () => {
  const sm = read('dist/sitemap.xml');
  for (const slug of Object.values(cats)) assert.match(sm, new RegExp(`<loc>https://decisionprocess\\.net/cards/${slug}\\.html</loc>`), slug);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ids = [
  ...Array.from({ length: 22 }, (_, i) => `ar${String(i).padStart(2, '0')}`),
  ...['wa', 'cu', 'sw', 'pe'].flatMap((s) => Array.from({ length: 14 }, (_, i) => `${s}${String(i + 1).padStart(2, '0')}`)),
];
const CTA = 'カードを引いて、決めたいことを整理する';

test('78 card pages and index exist', () => {
  assert.equal(ids.length, 78);
  assert.ok(existsSync(new URL('../dist/cards/index.html', import.meta.url)));
  for (const id of ids) assert.ok(existsSync(new URL(`../dist/cards/${id}.html`, import.meta.url)), id);
});

test('each card page has SEO essentials, CTAs, credit and alt', () => {
  for (const id of ids) {
    const html = read(`dist/cards/${id}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://decisionprocess\\.net/cards/${id}"`), id);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, id);
    assert.match(html, /property="og:title"/, id);
    assert.match(html, /name="twitter:card"/, id);
    assert.match(html, /"@type":\s*"Article"/, id);
    assert.match(html, /"@type":\s*"BreadcrumbList"/, id);
    assert.equal((html.match(/<aside class="cta"/g) || []).length, 1, `${id} CTA count`);
    assert.match(html, /images: sixseeds\/tarot-api, public domain/, id);
    assert.match(html, /<img [^>]*alt="[^"]+"/, id);
    assert.match(html, /決断・迷いにおけるヒント/, id);
    assert.doesNotMatch(html, /<script(?![^>]*(?:application\/ld\+json|data-press))/, `${id} must not need JS`);
  }
});

test('app index is indexable and links to cards', () => {
  const html = read('dist/index.html');
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /href="\.\/cards\/"/);
});

test('service worker bypasses /cards/ and is bumped', () => {
  const sw = read('dist/service-worker.js');
  assert.ok(Number((sw.match(/decide-shell-editorial-v(\d+)/) || [])[1]) >= 85, "shell cache must be bumped to >= v85");
  assert.match(sw, /url\.pathname\.includes\('\/cards\/'\)/);
  assert.match(sw, /url\.pathname\.includes\('\/articles\/'\)/);
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
    assert.match(html, new RegExp(`<link rel="canonical" href="https://decisionprocess\\.net/cards/${slug}"`), slug);
    assert.match(html, /"@type":\s*"BreadcrumbList"/, slug);
    assert.match(html, /"@type":\s*"ItemList"/, slug);
    assert.equal(html.split(CTA).length - 1, 1, `${slug} CTA count`);
    assert.doesNotMatch(html, /<script(?![^>]*(?:application\/ld\+json|data-press))/, slug);
  }
});

test('card pages link to their category and neighbours', () => {
  for (const id of ids) {
    const html = read(`dist/cards/${id}.html`);
    assert.match(html, new RegExp(`href="\\./${cats[id.slice(0, 2)]}"`), id);
    if (!['ar00', 'wa01', 'cu01', 'sw01', 'pe01'].includes(id)) assert.match(html, /rel="prev"/, id);
    if (!['ar21', 'wa14', 'cu14', 'sw14', 'pe14'].includes(id)) assert.match(html, /rel="next"/, id);
  }
  const idx = read('dist/cards/index.html');
  for (const slug of Object.values(cats)) assert.match(idx, new RegExp(`href="\\./${slug}"`), slug);
});

test('sitemap includes category pages', () => {
  const sm = read('dist/sitemap.xml');
  for (const slug of Object.values(cats)) assert.match(sm, new RegExp(`<loc>https://decisionprocess\\.net/cards/${slug}</loc>`), slug);
});

const worries = ['tenshoku', 'wakare', 'hikkoshi', 'kekkon', 'manabi', 'dokuritsu', 'ningen', 'okane', 'renai', 'shukatsu', 'kaigo', 'fukugyo'];

test('card CTAs are a single next step into the draw screen, without a popup handoff', () => {
  for (const file of [...ids, ...Object.values(cats), ...worries.map((w) => `worry-${w}`), 'index', 'worries']) {
    const html = read(`dist/cards/${file}.html`);
    assert.doesNotMatch(html, /\?from=/, file);
    for (const m of html.matchAll(/<(?:aside|div) class="cta"[\s\S]*?<\/(?:aside|div)>/g)) {
      assert.match(m[0], /<a href="\.\.\/\?go=home">/, file);
      assert.doesNotMatch(m[0], /迷い|DECIDE\. ?で/, file);
    }
  }
  assert.equal(existsSync(new URL('../dist/card-entry.js', import.meta.url)), false);
  assert.doesNotMatch(read('dist/index.html'), /card-entry/);
  assert.doesNotMatch(read('dist/service-worker.js'), /card-entry/);
  assert.doesNotMatch(read('dist/styles.css'), /card-entry-guide/);
});

test('worry pages have SEO essentials, CTAs into the app, credit and no JS', () => {
  const sm = read('dist/sitemap.xml');
  for (const slug of worries) {
    const html = read(`dist/cards/worry-${slug}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://decisionprocess\\.net/cards/worry-${slug}"`), slug);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, slug);
    assert.match(html, /"@type":\s*"Article"/, slug);
    assert.match(html, /"@type":\s*"BreadcrumbList"/, slug);
    const ctaLinks = [...html.matchAll(/<aside class="cta"[\s\S]*?<a href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ctaLinks, ['../?go=home'], `${slug} CTA`);
    assert.match(html, /images: sixseeds\/tarot-api, public domain/, slug);
    assert.match(html, /href="\.\/worries"/, slug);
    assert.doesNotMatch(html, /<script(?![^>]*(?:application\/ld\+json|data-press))/, slug);
    assert.doesNotMatch(html, /sk_live|sk_test|whsec_|service_role/, slug);
    assert.match(sm, new RegExp(`<loc>https://decisionprocess\\.net/cards/worry-${slug}</loc>`), slug);
  }
});

test('card tiles, worry card rows, theme buttons and worry chips keep a pressed state until the next page opens', () => {
  for (const file of ['major', 'worries', 'worry-tenshoku', 'cu08']) {
    const html = read(`dist/cards/${file}.html`);
    // Only the tap-feedback enhancement may run; the page itself must not need JS.
    const scripts = [...html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.equal(scripts.length, 1, file);
    assert.match(scripts[0], /is-pressed/, file);
    assert.match(scripts[0], /pageshow/, file);
    assert.doesNotMatch(scripts[0], /innerHTML|insertAdjacent|createElement|textContent/, file);
    assert.match(html, /\.grid a\.is-pressed/, file);
    assert.match(html, /\.wcards a\.is-pressed/, file);
    assert.match(html, /\.cats a\.is-pressed/, file);
    assert.match(scripts[0], /\.cats a/, file);
    assert.match(html, /@view-transition\{navigation:auto\}/, file);
    assert.match(html, /prefers-reduced-motion:reduce\)\{[^}]*\}@view-transition\{navigation:none\}/, file);
    assert.match(html, /<script data-press>[\s\S]*?<\/script>\n<\/head>/, file);
    assert.match(scripts[0], /pagereveal/, file);
    assert.match(scripts[0], /history\.back\(\)/, file);
    assert.match(scripts[0], /setTimeout\(function\(\)\{location\.href=t\.href\},150\)/, file);
    assert.match(html, /<a class="back" href="[^"]+"/, file);
  }
  // Each related-card row is one link: picture, name and reason all open the card page.
  const rows = [...read('dist/cards/worry-tenshoku.html').matchAll(/<li><a href="\.\/(\w+)">([\s\S]*?)<\/a><\/li>/g)].filter((m) => m[2].includes('<h3>'));
  assert.ok(rows.length >= 3);
  for (const [, , inner] of rows) assert.match(inner, /<picture>[\s\S]*<h3>[^<]+<\/h3><p>[^<]+<\/p>/);
});

test('worries index lists all worry pages and is linked from cards index', () => {
  const html = read('dist/cards/worries.html');
  assert.match(html, /"@type":\s*"ItemList"/);
  assert.equal(html.split(CTA).length - 1, 1, 'worries CTA count');
  for (const slug of worries) assert.match(html, new RegExp(`href="\\./worry-${slug}"`), slug);
  assert.match(read('dist/cards/index.html'), /href="\.\/worries"/);
  assert.match(read('dist/sitemap.xml'), /<loc>https:\/\/decisionprocess\.net\/cards\/worries<\/loc>/);
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

test('card and worry pages point og:image at a generated 1200x630 JPEG under 250KB', () => {
  const pages = [...ids.map((id) => `dist/cards/${id}.html`), ...worries.map((slug) => `dist/cards/worry-${slug}.html`)];
  for (const page of pages) {
    const html = read(page);
    const m = html.match(/property="og:image" content="([^"]+)"/);
    assert.ok(m, page);
    assert.match(m[1], /^https:\/\/decisionprocess\.net\/assets\/og\/[a-z0-9-]+\.jpg$/, page);
    const jpg = new URL(m[1].replace('https://decisionprocess.net/', '../dist/'), import.meta.url);
    assert.ok(existsSync(jpg), `${page} → ${m[1]}`);
    const buf = readFileSync(jpg);
    assert.deepEqual(jpegSize(buf), { w: 1200, h: 630 }, page);
    assert.ok(buf.length < 250 * 1024, `${page} ${buf.length} bytes`);
    assert.match(html, /property="og:image:width" content="1200"/, page);
    assert.match(html, /property="og:image:height" content="630"/, page);
  }
});

test('sitemap lists extensionless URLs only and keeps the same 101 entries', () => {
  const sm = read('dist/sitemap.xml');
  const locs = [...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, 101);
  assert.ok(locs.every((u) => !u.endsWith('.html')), 'no .html in sitemap');
  assert.ok(locs.includes('https://decisionprocess.net/cards/ar00'));
  assert.ok(locs.includes('https://decisionprocess.net/privacy'));
});

test('404 page is standalone, noindex and uses root-absolute links', () => {
  const html = read('dist/404.html');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<title>ページが見つかりません - DECIDE.<\/title>/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/cards\/"/);
  assert.match(html, /href="\/cards\/worries"/);
  assert.doesNotMatch(html, /(?:href|src)="\.\.?\//, 'no relative URLs');
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(read('dist/sitemap.xml'), /404/);
});

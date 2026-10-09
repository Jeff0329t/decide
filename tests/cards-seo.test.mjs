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
  assert.ok(Number((sw.match(/decide-shell-editorial-v(\d+)/) || [])[1]) >= 85, "shell cache must be bumped to >= v85");
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

test('card CTAs carry ?from= context into the app', () => {
  for (const id of ids) {
    const html = read(`dist/cards/${id}.html`);
    assert.equal(html.split(`href="../?from=${id}"`).length - 1, 2, `${id} from links`);
  }
  for (const slug of Object.values(cats)) assert.match(read(`dist/cards/${slug}.html`), new RegExp(`href="\\.\\./\\?from=${slug}"`), slug);
});

test('card-entry.js validates from and is loaded/cached by the app', async () => {
  await import(new URL('../dist/card-entry.js', import.meta.url));
  const { parseCardEntry, cardEntryLabel } = globalThis.DECIDE_CARD_ENTRY;
  for (const id of ids) assert.deepEqual(parseCardEntry(id), { type: 'card', id });
  for (const slug of Object.values(cats)) assert.equal(parseCardEntry(slug).type, 'category');
  for (const bad of ['', 'ar22', 'wa00', 'wa15', 'xx01', 'WA05', '<script>', 'constructor', 'toString']) assert.equal(parseCardEntry(bad), null, bad);
  assert.equal(cardEntryLabel({ type: 'card', id: 'wa05' }, [{ name: 'ワンドの5', image: './assets/rider-waite/wa05.jpg' }]), 'ワンドの5');
  assert.equal(cardEntryLabel({ type: 'category', id: 'wands' }, []), 'ワンド');
  const src = read('dist/card-entry.js');
  assert.doesNotMatch(src, /localStorage|innerHTML/);
  assert.match(read('dist/index.html'), /<script src="\.\/app\.js"><\/script>\s*<script src="\.\/card-entry\.js"><\/script>/);
  assert.match(read('dist/service-worker.js'), /'\.\/card-entry\.js'/);
});

const worries = ['tenshoku', 'wakare', 'hikkoshi', 'kekkon', 'manabi', 'dokuritsu', 'ningen', 'okane', 'renai', 'shukatsu', 'kaigo', 'fukugyo'];

test('worry pages have SEO essentials, CTAs into the app, credit and no JS', () => {
  const sm = read('dist/sitemap.xml');
  for (const slug of worries) {
    const html = read(`dist/cards/worry-${slug}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://decisionprocess\\.net/cards/worry-${slug}\\.html"`), slug);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, slug);
    assert.match(html, /"@type":\s*"Article"/, slug);
    assert.match(html, /"@type":\s*"BreadcrumbList"/, slug);
    assert.equal(html.split(CTA).length - 1, 2, `${slug} CTA count`);
    const froms = [...html.matchAll(/href="\.\.\/\?from=([^"]+)"/g)].map((m) => m[1]);
    assert.equal(froms.length, 2, `${slug} from links`);
    for (const f of froms) assert.ok(ids.includes(f), `${slug} from=${f}`);
    assert.match(html, /images: sixseeds\/tarot-api, public domain/, slug);
    assert.match(html, /href="\.\/worries\.html"/, slug);
    assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)/, slug);
    assert.doesNotMatch(html, /sk_live|sk_test|whsec_|service_role/, slug);
    assert.match(sm, new RegExp(`<loc>https://decisionprocess\\.net/cards/worry-${slug}\\.html</loc>`), slug);
  }
});

test('worries index lists all worry pages and is linked from cards index', () => {
  const html = read('dist/cards/worries.html');
  assert.match(html, /"@type":\s*"ItemList"/);
  assert.equal(html.split(CTA).length - 1, 1, 'worries CTA count');
  for (const slug of worries) assert.match(html, new RegExp(`href="\\./worry-${slug}\\.html"`), slug);
  assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)/);
  assert.match(read('dist/cards/index.html'), /href="\.\/worries\.html"/);
  assert.match(read('dist/sitemap.xml'), /<loc>https:\/\/decisionprocess\.net\/cards\/worries\.html<\/loc>/);
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cardsSeo } from '../scripts/lib/cards-seo.mjs';
import { enhanceCardsPage } from '../scripts/lib/cards-navigation-seo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://decisionprocess.net';
const read = p => readFileSync(join(root, p), 'utf8');
const canonical = file => `/cards/${file === 'index.html' ? '' : file}`;
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
const deck = JSON.parse(read('dist/assets/cards.json')).cards;

function validate(file, html) {
  const data = ld(html), path = canonical(file), url = origin + path;
  const breadcrumbs = data.filter(x => x['@type'] === 'BreadcrumbList');
  assert.equal(breadcrumbs.length, 1, file);
  const trail = breadcrumbs[0].itemListElement;
  assert.equal(trail.length, file === 'index.html' ? 2 : 3, file);
  assert.deepEqual(trail.map(x => x.position), trail.map((_, i) => i + 1));
  assert.equal(trail[0].name, 'DECIDE.');
  assert.equal(trail[1].name, 'タロットカード78枚の意味');
  assert.equal(trail[1].item, origin + '/cards/');
  assert.equal(trail.at(-1).item, url);
  const page = data.filter(x => ['Article', 'WebPage'].includes(x['@type']));
  assert.equal(page.length, 1, file);
  assert.equal(page[0].headline, cardsSeo[file].title, file);
  assert.equal(page[0].description, cardsSeo[file].description, file);
  assert.equal(page[0].url, url);
  assert.equal(page[0].publisher.name, 'DECIDE.');
  if (page[0]['@type'] === 'WebPage') assert.ok(data.some(x => x['@type'] === 'ItemList'));
  assert.equal(enhanceCardsPage(html, path), html, `${file}: regeneration is idempotent`);
  assert.doesNotMatch(html, /<base|noindex|\.preview\.html|seo-proposal/);
  const body = html.split('<body>')[1];
  if (file !== 'index.html') assert.match(body, /href="\.\/"/);
  const card = deck.find(c => c.id + '.html' === file);
  if (card) {
    const section = html.match(/<!-- related-worries:start -->(.*?)<!-- related-worries:end -->/s)?.[1];
    assert.ok(section, file);
    const worries = [...section.matchAll(/href="\.\/worry-([a-z]+)\.html"/g)];
    assert.ok(worries.length >= 2 && worries.length <= 3, file);
    assert.equal(new Set(worries.map(x => x[1])).size, worries.length);
    const suit = deck.filter(c => c.arcana === card.arcana), index = suit.findIndex(c => c.id === card.id);
    const pager = html.match(/<nav aria-label="前後のカード">(.*?)<\/nav>/s)[1];
    const expected = [suit[index - 1]?.id, suit[index + 1]?.id].filter(Boolean);
    assert.deepEqual([...pager.matchAll(/href="\.\/([^\"]+)\.html"/g)].map(m => m[1]), expected, file);
  }
  if (file.startsWith('worry-')) {
    const section = body.match(/<h2>他の悩みから探す<\/h2>(.*?)<\/section>/s)?.[1];
    assert.ok(section, file);
    assert.equal(new Set([...section.matchAll(/href="\.\/worry-([^\"]+)\.html"/g)].map(x => x[1])).size, 11);
    assert.match(section, /すべてのカード・悩み一覧を見る/);
  }
  if (card || file.startsWith('worry-')) {
    const ctas = [...body.matchAll(/<aside class="cta"(.*?)<\/aside>/gs)];
    assert.equal(ctas.length, 2, file);
    assert.match(ctas.at(-1)[1], /href="\.\.\/\?from=(?:ar|cu|wa|sw|pe)\d{2}"/);
    assert.doesNotMatch(ctas.at(-1)[1], /今抱えている迷いを、このカードの視点から考えてみる/);
  }
  for (const m of body.matchAll(/href="\.\/([^"?#]*)"/g)) if (m[1]) {
    assert.ok(readdirSync(join(root, 'dist/cards')).includes(m[1]), `${file}: ${m[1]}`);
  }
}

test('all 97 pages have synchronized structured data, crawlable navigation and persistent CTAs', () => {
  assert.equal(Object.keys(cardsSeo).length, 97);
  for (const file of Object.keys(cardsSeo)) validate(file, read(`dist/cards/${file}`));
  const article = '<html><head></head><body><h1>Unrelated</h1></body></html>';
  assert.equal(enhanceCardsPage(article, '/articles/example.html'), article);
});

test('reading links survive initial and runtime home rendering without replacing existing actions', () => {
  for (const file of ['dist/index.html', 'dist/app.js']) {
    const source = read(file), nav = source.match(/<div class="home-reading-links"(.*?)<\/div>/s)?.[1];
    assert.ok(nav, file);
    for (const href of ['./cards/', ...['tenshoku', 'renai', 'okane'].map(s => `./cards/worry-${s}.html`)]) assert.ok(nav.includes(`href="${href}"`));
    assert.match(source, /class="splash-atlas" data-action="open-learn"/);
    assert.match(source, /class="splash-help" data-action="tutorial-open"/);
  }
});

test('full source generation preserves enhancements and keeps proposals outside dist and sitemap', () => {
  const temp = mkdtempSync(join(tmpdir(), 'decide-cards-regenerate-'));
  try {
    cpSync(join(root, 'scripts'), join(temp, 'scripts'), { recursive: true });
    mkdirSync(join(temp, 'dist/assets'), { recursive: true });
    cpSync(join(root, 'dist/assets/cards.json'), join(temp, 'dist/assets/cards.json'));
    execFileSync(process.execPath, ['scripts/build-cards.mjs'], { cwd: temp, stdio: 'pipe' });
    const generated = join(temp, 'dist/cards');
    assert.deepEqual(readdirSync(generated).sort(), Object.keys(cardsSeo).sort());
    const first = new Map();
    for (const file of Object.keys(cardsSeo)) {
      const html = readFileSync(join(generated, file), 'utf8');
      validate(file, html);
      first.set(file, html);
    }
    execFileSync(process.execPath, ['scripts/build-cards.mjs'], { cwd: temp, stdio: 'pipe' });
    for (const [file, html] of first) assert.equal(readFileSync(join(generated, file), 'utf8'), html, file);
    for (const dir of [join(root, 'dist'), join(temp, 'dist')]) {
      const sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
      assert.doesNotMatch(sitemap, /docs|preview|proposal|proposed|backups/);
      const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
      assert.deepEqual(urls.filter(s => s.startsWith(origin + '/cards/')).sort(), Object.keys(cardsSeo).map(f => origin + canonical(f)).sort());
      for (const file of readdirSync(dir, { recursive: true })) assert.doesNotMatch(file, /cards-navigation-seo-proposal|\.preview\.html|\.proposed\.html/);
    }
    assert.match(read('.github/workflows/pages.yml'), /path: dist/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

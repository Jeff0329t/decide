// Content-link i18n smoke: in English mode, every link the app renders to a
// Japanese content page (card / worry indexes and pages, articles, About)
// must point at the English version under /en/, including links rendered
// after load and anchors inserted dynamically. Legal pages (privacy /
// terms / tokushoho) and external links stay untouched. In Japanese mode
// nothing is rewritten.
// Run: node scripts/browser-links-i18n-smoke.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

function serve(root) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const hrefsOf = (page, selector) => page.evaluate((sel) =>
  [...document.querySelectorAll(sel)].map((a) => a.getAttribute('href')), selector);
const hrefOf = async (page, selector) => (await hrefsOf(page, selector))[0] ?? null;

async function openHome(page, base) {
  await page.goto(base);
  await page.locator('.splash-screen').waitFor({ timeout: 15000 });
  await page.locator('.splash-hit').click();
  await page.locator('.quickstart-screen').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600); // let the i18n observer run
}

// The full rewrite matrix, exercised through the function the runtime
// exposes on window.DECIDE_I18N in English mode.
const MATRIX = [
  // content pages the app actually links to
  ['./cards/', './en/cards/'],
  ['./cards/worries', './en/cards/worries'],
  ['./articles/', './en/articles/'],
  ['./about', './en/about'],
  // individual card / worry / article pages and other shapes
  ['./cards', './en/cards'],
  ['./cards/ar00', './en/cards/ar00'],
  ['./cards/major', './en/cards/major'],
  ['./cards/worry-tenshoku', './en/cards/worry-tenshoku'],
  ['./articles', './en/articles'],
  ['./articles/kimerarenai', './en/articles/kimerarenai'],
  ['/cards/', '/en/cards/'],
  ['/cards/worries', '/en/cards/worries'],
  ['/about', '/en/about'],
  ['cards/worries', 'en/cards/worries'],
  // query and fragment are preserved
  ['./cards/?go=history#top', './en/cards/?go=history#top'],
  ['./about#faq', './en/about#faq'],
  // no English version / not content: untouched (null)
  ['./privacy', null],
  ['./terms', null],
  ['./tokushoho', null],
  ['./success', null],
  ['./unsubscribe', null],
  // already English: idempotent
  ['./en/cards/', null],
  ['/en/about', null],
  // external / non-navigational: untouched
  ['https://x.com/intent/post?text=x', null],
  ['https://decisionprocess.net/cards/', null],
  ['mailto:decisionprocess.decide@gmail.com', null],
  ['#top', null],
  ['', null],
];

(async () => {
  const server = await serve(path.join(__dirname, '..', 'dist'));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const seedTutorial = () => { try { localStorage.setItem('decide.tarot.tutorial.v1', JSON.stringify({ status: 'completed' })); } catch (e) {} };
  const newCtx = async (opts) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block', ...opts });
    await ctx.addInitScript(seedTutorial);
    return ctx;
  };
  try {
    // ---- EN: home, footer, settings, dynamic DOM, rewrite matrix ----
    const ctxEn = await newCtx({ locale: 'en-US' });
    const en = await ctxEn.newPage();
    await openHome(en, base);

    // Home quickstart card -> English card index.
    assert.equal(await hrefOf(en, '.quickstart-cards'), './en/cards/');

    // Static footer of the app shell -> all English.
    assert.deepEqual(await hrefsOf(en, '.site-about nav a'),
      ['./en/cards/worries', './en/cards/', './en/articles/', './en/about']);

    // The pure rewrite rule, whole matrix at once.
    const results = await en.evaluate((cases) =>
      cases.map(([raw]) => window.DECIDE_I18N.rewriteHref(raw)), MATRIX);
    assert.deepEqual(results, MATRIX.map(([, expected]) => expected),
      `rewriteHref matrix mismatch: ${JSON.stringify(results)}`);

    // An anchor inserted after load is rewritten by the observer.
    await en.evaluate(() => {
      const a = document.createElement('a');
      a.id = 'smoke-dynamic-link';
      a.href = './cards/worry-renai';
      a.textContent = 'dynamic';
      document.body.append(a);
    });
    await en.waitForTimeout(500);
    assert.equal(await hrefOf(en, '#smoke-dynamic-link'), './en/cards/worry-renai');

    // Settings is rendered on navigation: its links are rewritten too,
    // while the legal links (no English version) stay Japanese-side.
    await en.locator('.bottom-nav [data-nav="settings"]').click();
    await en.waitForTimeout(900);
    assert.equal(await hrefOf(en, '.settings-links a.settings-link'), './en/cards/worries');
    assert.deepEqual(await hrefsOf(en, '.settings-legal a'),
      ['./privacy', './terms', './tokushoho', 'mailto:decisionprocess.decide@gmail.com']);
    await ctxEn.close();

    // ---- JA: nothing is rewritten ----
    const ctxJa = await newCtx({ locale: 'ja-JP' });
    const ja = await ctxJa.newPage();
    await openHome(ja, base);
    assert.equal(await ja.evaluate(() => window.DECIDE_I18N.rewriteHref), undefined,
      'rewriteHref must not exist in Japanese mode');
    assert.equal(await hrefOf(ja, '.quickstart-cards'), './cards/');
    assert.deepEqual(await hrefsOf(ja, '.site-about nav a'),
      ['./cards/worries', './cards/', './articles/', './about']);
    await ja.locator('.bottom-nav [data-nav="settings"]').click();
    await ja.waitForTimeout(900);
    assert.equal(await hrefOf(ja, '.settings-links a.settings-link'), './cards/worries');
    await ctxJa.close();

    console.log('browser-links-i18n-smoke: OK');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

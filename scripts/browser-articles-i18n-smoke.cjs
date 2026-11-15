// Related-articles i18n smoke: in English mode the Learn > Articles tab is
// fully English — intro, search box, list excerpts come from
// assets/related-articles-en.json, and the reader shows the English back
// button, body and "Keep reading" section. Search matches the English body
// text. In Japanese mode the tab is unchanged and the English data file is
// never requested.
// Run: node scripts/browser-articles-i18n-smoke.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
const JA_RE = /[぀-ヿ一-鿿]/;

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

const enData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'assets', 'related-articles-en.json'), 'utf8'));
const jaData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'assets', 'related-articles.json'), 'utf8'));

async function openArticles(page, base) {
  await page.goto(base);
  await page.locator('.splash-screen').waitFor({ timeout: 15000 });
  await page.locator('.splash-hit').click();
  await page.locator('.quickstart-screen').waitFor({ timeout: 15000 });
  await page.locator('[data-action="open-articles"]').click();
  await page.locator('.learn-article-item').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600); // let the i18n observer run
}

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
    // ---- EN: list, search, reader ----
    const ctxEn = await newCtx({ locale: 'en-US' });
    const en = await ctxEn.newPage();
    const requests = [];
    en.on('request', (r) => requests.push(r.url()));
    await openArticles(en, base);
    assert.ok(requests.some((u) => u.includes('related-articles-en.json')), 'English article data was fetched');

    assert.equal(await en.locator('.learn-articles-intro').textContent(), 'Start with a topic that catches your eye.');
    const search = en.locator('#learn-article-search');
    assert.equal(await search.getAttribute('placeholder'), 'Search articles by a word that comes to mind');
    assert.equal(await search.getAttribute('aria-label'), 'Search articles');
    assert.equal(await en.locator('.learn-article-count').textContent(), '126 articles');
    assert.equal(await en.locator('.learn-filters').getAttribute('aria-label'), 'Article themes');

    const first = enData.articles[0];
    assert.equal(await en.locator('.learn-article-item strong').first().textContent(), first.title);
    assert.equal(await en.locator('.learn-article-item p').first().textContent(), first.summary);
    const listText = await en.locator('.learn-article-list').textContent();
    assert.ok(!JA_RE.test(listText), 'article list contains Japanese');

    // Search hits the English body text, not just titles/summaries.
    const probe = enData.articles[5];
    const probeWord = (probe.blocks.map((b) => b.text).join(' ').match(/[A-Za-z]{6,}/) || [])[0];
    assert.ok(probeWord, 'probe word found');
    await search.fill(probeWord);
    await en.waitForTimeout(300);
    assert.match(await en.locator('.learn-article-count').textContent(), new RegExp(`^\\d+ articles? \\(searching for “${probeWord}”\\)$`));
    assert.ok(await en.locator(`.learn-article-item[data-id="${probe.id}"]`).count(), 'body search finds the article');
    await search.fill('');
    await en.waitForTimeout(300);

    // Reader: back button, title, body, next-up section, nav aria-label.
    await en.locator('.learn-article-item').first().click();
    await en.locator('.learn-article-reader').waitFor({ timeout: 15000 });
    await en.waitForTimeout(600);
    assert.equal(await en.locator('.learn-lesson-back').textContent(), '← Articles');
    assert.equal(await en.locator('.learn-article-reader > h2').textContent(), first.title);
    const bodyText = await en.locator('.learn-article-body').textContent();
    assert.ok(!JA_RE.test(bodyText), 'article body contains Japanese');
    assert.equal(await en.locator('.learn-article-body').locator(':scope > *').count(), first.blocks.length);
    assert.equal(await en.locator('.learn-article-next h3').textContent(), 'Keep reading');
    assert.equal(await en.locator('.learn-article-reader > .button.secondary').textContent(), 'Back to the article list');
    await en.waitForFunction(() =>
      document.querySelector('.bottom-nav [data-action="nav-back"]')?.getAttribute('aria-label') === 'Back to the article list',
      { timeout: 5000 });
    await en.locator('.learn-article-reader > .button.secondary').click();
    await en.locator('.learn-article-item').first().waitFor({ timeout: 15000 });
    await ctxEn.close();

    // ---- JA: unchanged, English data never fetched ----
    const ctxJa = await newCtx({ locale: 'ja-JP' });
    const ja = await ctxJa.newPage();
    const jaRequests = [];
    ja.on('request', (r) => jaRequests.push(r.url()));
    await openArticles(ja, base);
    assert.ok(!jaRequests.some((u) => u.includes('related-articles-en.json')), 'English article data must not be fetched in Japanese mode');
    assert.equal(await ja.locator('.learn-articles-intro').textContent(), '気になる話から読んでみましょう。');
    assert.equal(await ja.locator('#learn-article-search').getAttribute('placeholder'), '気になる言葉で記事を探す');
    assert.equal(await ja.locator('.learn-article-count').textContent(), '126件の記事');
    assert.equal(await ja.locator('.learn-article-item strong').first().textContent(), jaData.articles[0].title);
    await ja.locator('.learn-article-item').first().click();
    await ja.locator('.learn-article-reader').waitFor({ timeout: 15000 });
    assert.equal(await ja.locator('.learn-lesson-back').textContent(), '← 記事の一覧へ');
    assert.equal(await ja.locator('.learn-article-body').textContent(), jaData.articles[0].blocks.map((b) => b.text).join(''));
    await ctxJa.close();

    console.log('browser-articles-i18n-smoke: OK');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

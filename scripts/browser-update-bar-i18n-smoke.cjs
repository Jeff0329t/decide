// Update-bar i18n smoke: reproduce a real service-worker update (a waiting
// worker) in an en-US browser and check the "new version" bar is fully in
// English, then in a ja-JP browser and check it stays Japanese.
// The repo dist/ is copied to a temp dir so the served service-worker.js can
// be mutated between loads without touching the repository.
// Run: node scripts/browser-update-bar-i18n-smoke.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const JA_RE = /[぀-ヿ一-鿿]/;
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

async function waitControlled(page) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  });
}

async function showBarAndRead(page, swFile, fromVersion, toVersion) {
  await waitControlled(page);
  const sw = fs.readFileSync(swFile, 'utf8');
  assert.ok(sw.includes(fromVersion), `served SW contains ${fromVersion}`);
  fs.writeFileSync(swFile, sw.replace(fromVersion, toVersion));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
  await page.locator('.update-bar').waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForTimeout(600); // let the i18n observer run
  return page.evaluate(() => {
    const bar = document.querySelector('.update-bar');
    const buttons = [...bar.querySelectorAll('button')];
    return {
      text: bar.textContent.replace(/\s+/g, ' ').trim(),
      updateLabel: buttons[0] ? buttons[0].textContent.trim() : null,
      closeLabel: buttons[1] ? buttons[1].getAttribute('aria-label') : null,
    };
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'decide-sw-e2e-'));
  fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
  const swFile = path.join(tmp, 'service-worker.js');
  const server = await serve(tmp);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  try {
    // English visitor: the update bar must be fully English.
    const ctxEn = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'en-US' });
    const pageEn = await ctxEn.newPage();
    await pageEn.goto(base);
    const en = await showBarAndRead(pageEn, swFile, 'v274', 'v274u');
    assert.ok(en.text.includes('A new version is available'), `EN bar text: ${en.text}`);
    assert.equal(en.updateLabel, 'Update');
    assert.equal(en.closeLabel, 'Close');
    assert.ok(!JA_RE.test(en.text), `EN bar has Japanese: ${en.text}`);
    await ctxEn.close();

    // Japanese visitor: the bar must stay Japanese.
    const ctxJa = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'ja-JP' });
    const pageJa = await ctxJa.newPage();
    await pageJa.goto(base);
    const ja = await showBarAndRead(pageJa, swFile, 'v274u', 'v274v');
    assert.ok(ja.text.includes('新しいバージョンがあります。'), `JA bar text: ${ja.text}`);
    assert.equal(ja.updateLabel, '更新する');
    assert.equal(ja.closeLabel, '閉じる');
    await ctxJa.close();
    console.log('browser-update-bar-i18n-smoke: OK');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });

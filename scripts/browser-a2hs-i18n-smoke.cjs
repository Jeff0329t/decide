// A2HS (Add to Home Screen) i18n smoke: in an en-US browser, the home
// install banner, the A2HS help sheet (iOS steps / Chrome steps / in-app
// browser note), the detail-screen install banner (Safari and installable
// variants) and the backup help sheet must be fully English — text,
// aria-labels and values — while a ja-JP browser keeps them Japanese.
// Run: node scripts/browser-a2hs-i18n-smoke.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const JA_RE = /[぀-ヿ一-鿿]/;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

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

// Japanese leftovers inside one subtree: visible text nodes, the
// placeholder / aria-label / title attributes, and field values.
async function jaLeftoversIn(page, selector, label) {
  const left = await page.evaluate(({ sel, reSrc }) => {
    const root = document.querySelector(sel);
    if (!root) return ['__missing root: ' + sel];
    const re = new RegExp(reSrc);
    const out = new Set();
    const vis = (el) => el && el.offsetParent !== null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t && re.test(t) && vis(n.parentElement)) out.add(t.slice(0, 80));
    }
    for (const a of ['aria-label', 'title']) {
      const v = root.getAttribute && root.getAttribute(a);
      if (v && re.test(v)) out.add(`${a}: ${v.slice(0, 80)}`);
    }
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => {
      if (!vis(el)) return;
      for (const a of ['placeholder', 'aria-label', 'title']) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) out.add(`${a}: ${v.slice(0, 80)}`);
      }
    });
    root.querySelectorAll('input,textarea,select').forEach((el) => {
      if (vis(el) && el.value && re.test(el.value)) out.add(`value: ${el.value.slice(0, 80)}`);
    });
    return [...out];
  }, { sel: selector, reSrc: JA_RE.source });
  assert.deepEqual(left, [], `Japanese leftovers in ${label}: ${left.join(' / ')}`);
}

const textOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}, selector);

async function openHome(page, base) {
  await page.goto(base);
  await page.locator('.splash-screen').waitFor({ timeout: 15000 });
  await page.locator('.splash-hit').click();
  await page.locator('.quickstart-screen').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600); // let the i18n observer run
}

// One-card draw -> save: lands on the completion screen; opening the log
// from History then shows the detail screen with its A2HS banner.
async function saveFirstLogAndOpenDetail(page) {
  await page.locator('[data-action="start"][data-mode="one"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-action="select-genre"]').first().click();
  await page.waitForTimeout(900);
  await page.locator('.flip-card').nth(5).click();
  await page.waitForTimeout(1400);
  await page.locator('[data-action="choose-decision"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('[data-save-decision]').click({ force: true });
  await page.waitForTimeout(1500);
  assert.match(await textOf(page, 'body'), /This decision has been recorded\./);
  await page.locator('.bottom-nav [data-nav="history"]').click();
  await page.waitForTimeout(700);
  await page.locator('.history-item').first().click();
  await page.waitForTimeout(800);
  await page.locator('.a2hs-banner').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
}

async function checkBackupSheet(page, label, blockPattern) {
  await page.locator('.bottom-nav [data-nav="settings"]').click();
  await page.waitForTimeout(800);
  await page.locator('[data-action="backup-help"]').click();
  await page.locator('#backup-help-title').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.querySelector('#backup-help-title').closest('.modal-wrap').id = 'smoke-backup-sheet';
  });
  await jaLeftoversIn(page, '#smoke-backup-sheet', label);
  if (blockPattern) assert.match(await textOf(page, '#smoke-backup-sheet'), blockPattern);
  await page.locator('#smoke-backup-sheet [data-action="close-backup-help"]').last().click();
  await page.waitForTimeout(400);
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
    // ---- EN + iPhone: home banner, iOS help sheet, detail banner (Safari variant), backup sheet ----
    const ctxIos = await newCtx({ locale: 'en-US', userAgent: IPHONE_UA });
    const ios = await ctxIos.newPage();
    await openHome(ios, base);
    await ios.locator('.home-install').waitFor({ timeout: 10000 });
    await jaLeftoversIn(ios, '.home-install', 'EN home install banner');
    const bannerText = await textOf(ios, '.home-install');
    assert.match(bannerText, /Add to Home Screen/);
    assert.match(bannerText, /Right there, anytime\./);
    assert.match(bannerText, /Open it in one tap from your Home Screen\./);
    assert.equal(await ios.locator('.home-install-close').getAttribute('aria-label'), 'Hide this notice for 2 days');
    assert.equal(await ios.locator('.home-install-never').getAttribute('aria-label'), 'Already added — don’t show again');
    assert.equal(await ios.locator('.home-install-button').getAttribute('data-action'), 'a2hs-help');
    await ios.locator('.home-install-button').click();
    await ios.locator('#a2hs-help-modal').waitFor({ timeout: 10000 });
    await ios.waitForTimeout(600);
    await jaLeftoversIn(ios, '#a2hs-help-modal', 'EN iOS A2HS help sheet');
    const iosSheet = await textOf(ios, '#a2hs-help-modal');
    assert.match(iosSheet, /On iPhone, you can add it from Safari\./);
    assert.match(iosSheet, /Tap the Share button \(□ with ↑\)/);
    assert.match(iosSheet, /Choose “Add to Home Screen”/);
    assert.match(iosSheet, /Tap “Add”/);
    assert.match(iosSheet, /Got it/);
    assert.match(iosSheet, /Already added — don’t show again/);
    assert.equal(await ios.locator('#a2hs-help-modal .modal-shade').getAttribute('aria-label'), 'Close the add instructions');
    await ios.locator('#a2hs-help-modal .confirm-actions button').first().click();
    await ios.waitForTimeout(400);

    await saveFirstLogAndOpenDetail(ios);
    await jaLeftoversIn(ios, '.a2hs-banner', 'EN detail A2HS banner (Safari variant)');
    const detailBanner = await textOf(ios, '.a2hs-banner');
    assert.match(detailBanner, /so your records don’t disappear\?/);
    assert.match(detailBanner, /records may be erased if you don’t open the app for a while/);
    assert.match(detailBanner, /How to add it/);
    assert.match(detailBanner, /Later/);
    assert.equal(await ios.locator('.a2hs-banner .banner-close').getAttribute('aria-label'), 'Close this notice');
    await ios.locator('.a2hs-banner [data-action="a2hs-help"]').click();
    await ios.locator('#a2hs-help-modal').waitFor({ timeout: 10000 });
    await ios.waitForTimeout(600);
    await jaLeftoversIn(ios, '#a2hs-help-modal', 'EN A2HS help sheet from detail banner');
    await ios.locator('#a2hs-help-modal .confirm-actions button').first().click();
    await ios.waitForTimeout(400);
    await checkBackupSheet(ios, 'EN backup help sheet (iPhone)');
    await ctxIos.close();

    // ---- EN + Android: Chrome help sheet ----
    const ctxAnd = await newCtx({ locale: 'en-US', userAgent: ANDROID_UA });
    const and = await ctxAnd.newPage();
    await openHome(and, base);
    await and.locator('.home-install').waitFor({ timeout: 10000 });
    await jaLeftoversIn(and, '.home-install', 'EN home install banner (Android)');
    assert.equal(await and.locator('.home-install-button').getAttribute('data-action'), 'a2hs-help');
    await and.locator('.home-install-button').click();
    await and.locator('#a2hs-help-modal').waitFor({ timeout: 10000 });
    await and.waitForTimeout(600);
    await jaLeftoversIn(and, '#a2hs-help-modal', 'EN Chrome A2HS help sheet');
    const andSheet = await textOf(and, '#a2hs-help-modal');
    assert.match(andSheet, /You can add it from the Chrome menu \(⋮\)\./);
    assert.match(andSheet, /Open the browser menu \(⋮\)/);
    assert.match(andSheet, /Choose “Add to Home Screen” or “Install app”/);
    assert.match(andSheet, /Confirm to add it/);
    assert.match(andSheet, /Got it/);
    await ctxAnd.close();

    // ---- EN + iPhone in-app browser (LINE): in-app help note ----
    const ctxLine = await newCtx({ locale: 'en-US', userAgent: IPHONE_UA + ' Line/15.0.0' });
    const line = await ctxLine.newPage();
    await openHome(line, base);
    await line.locator('.home-install').waitFor({ timeout: 10000 });
    await line.locator('.home-install-button').click();
    await line.locator('#a2hs-help-modal').waitFor({ timeout: 10000 });
    await line.waitForTimeout(600);
    await jaLeftoversIn(line, '#a2hs-help-modal', 'EN in-app-browser A2HS help sheet');
    assert.match(await textOf(line, '#a2hs-help-modal'), /Choose “Open in browser” from this app’s menu, then add it in Safari or Chrome\./);
    await ctxLine.close();

    // ---- EN + Android with an install prompt: installable detail banner + backup-sheet A2HS block ----
    const ctxInst = await newCtx({ locale: 'en-US', userAgent: ANDROID_UA });
    const inst = await ctxInst.newPage();
    await inst.goto(base);
    await inst.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      e.prompt = () => Promise.resolve();
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await inst.locator('.splash-screen').waitFor({ timeout: 15000 });
    await inst.locator('.splash-hit').click();
    await inst.locator('.quickstart-screen').waitFor({ timeout: 15000 });
    await inst.waitForTimeout(600);
    await inst.locator('.home-install').waitFor({ timeout: 10000 });
    assert.equal(await inst.locator('.home-install-button').getAttribute('data-action'), 'a2hs-install');
    await saveFirstLogAndOpenDetail(inst);
    await jaLeftoversIn(inst, '.a2hs-banner', 'EN detail A2HS banner (installable variant)');
    const instBanner = await textOf(inst, '.a2hs-banner');
    assert.match(instBanner, /open it instantly, like an app — and your records are less likely to disappear\./);
    assert.match(instBanner, /Add to Home Screen/);
    await checkBackupSheet(inst, 'EN backup help sheet (installable)', /Add to the Home Screen to open it instantly, like an app\./);
    await ctxInst.close();

    // ---- JA + iPhone: everything stays Japanese ----
    const ctxJa = await newCtx({ locale: 'ja-JP', userAgent: IPHONE_UA });
    const ja = await ctxJa.newPage();
    await openHome(ja, base);
    await ja.locator('.home-install').waitFor({ timeout: 10000 });
    const jaBanner = await textOf(ja, '.home-install');
    assert.match(jaBanner, /ホーム画面に追加/);
    assert.match(jaBanner, /いつでもすぐに。/);
    await ja.locator('.home-install-button').click();
    await ja.locator('#a2hs-help-modal').waitFor({ timeout: 10000 });
    const jaSheet = await textOf(ja, '#a2hs-help-modal');
    assert.match(jaSheet, /iPhoneでは、Safariから追加できます。/);
    assert.match(jaSheet, /共有ボタン（□に↑）を押す/);
    assert.match(jaSheet, /わかった/);
    await ctxJa.close();

    console.log('browser-a2hs-i18n-smoke: OK');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.BASE_URL || 'http://127.0.0.1:4189';
const out = path.resolve(__dirname, '../docs/cards-navigation-seo-2026-10-18');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [];
  try {
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.addInitScript(() => localStorage.setItem('decide.tarot.tutorial.v1', JSON.stringify({ status: 'completed', version: 1 })));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base);
      await page.locator('.splash-screen').waitFor();
      assert.equal(await page.locator('.splash-links').count(), 0, 'cover has no auxiliary link buttons');
      assert.equal(await page.locator('.home-reading-links').count(), 0, 'cover has no reading links');
      const startEl = page.locator('.splash-start');
      const startBox = await startEl.boundingBox();
      assert.ok(startBox && startBox.x >= 0 && startBox.x + startBox.width <= width && startBox.y >= 0 && startBox.y + startBox.height <= height, 'start control fits viewport');
      assert.ok(await startEl.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), 'start control is not covered');
      await page.screenshot({ path: path.join(out, `${width}-home.png`), fullPage: true });
      for (const filename of ['worry-okane', 'cu12']) {
        await page.goto(`${base}/cards/${filename}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${filename}: no horizontal overflow`);
        const cta = page.locator('aside.cta').last();
        await cta.scrollIntoViewIfNeeded();
        const box = await cta.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, `${filename}: CTA fits`);
        await page.screenshot({ path: path.join(out, `${width}-${filename}.png`), fullPage: true });
        await page.screenshot({ path: path.join(out, `${width}-${filename}-cta.png`), fullPage: false });
        assert.equal(await cta.locator('a').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(17, 17, 17)');
        await cta.locator('a').click();
        await page.waitForURL(url => new URL(url).pathname === '/' && !new URL(url).search);
        assert.equal(await page.locator('.card-entry-guide').count(), 0);
      }
      await page.goto(base);
      await page.locator('.splash-start button').click();
      await page.locator('.quickstart-screen').waitFor();
      assert.equal(await page.locator('.draw-choice').count(), 2);
      assert.deepEqual(errors, [], 'no JavaScript page errors');
      results.push({ width, height, coverStartOnly: 'passed', articleCtas: 'passed', horizontalOverflow: false, pageErrors: errors });
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'browser-audit.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

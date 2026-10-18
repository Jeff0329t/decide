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
      await page.locator('.home-reading-links').waitFor();
      for (const locator of [page.locator('.splash-help'), page.locator('.splash-atlas'), ...await page.locator('.home-reading-links a').all()]) {
        const box = await locator.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, 'cover link fits viewport');
        assert.ok(box.height >= 44, 'touch target has 44px height');
        assert.ok(await locator.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), 'cover link is not covered');
      }
      const start = await page.locator('.splash-start').boundingBox(), links = await page.locator('.splash-links').boundingBox();
      assert.ok(start.y + start.height <= links.y, 'start control does not overlap reading links');
      await page.screenshot({ path: path.join(out, `${width}-home.png`), fullPage: true });
      await page.locator('.home-reading-links a[href="./cards/worry-okane.html"]').click();
      await page.waitForURL('**/cards/worry-okane.html');
      for (const filename of ['worry-okane.html', 'cu12.html']) {
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
        await page.locator('.card-entry-guide').waitFor();
        assert.equal(new URL(page.url()).pathname, '/');
        assert.match(await page.locator('.card-entry-guide').innerText(), filename === 'cu12.html' ? /カップのナイト/ : /ペンタクルの4/);
      }
      await page.goto(base);
      await page.locator('.splash-atlas').click();
      await page.locator('.learn-tile').first().waitFor();
      assert.equal(await page.locator('.learn-tile').count(), 78);
      await page.locator('.bottom-nav [data-action="nav-back"]').click();
      await page.locator('.splash-start button').click();
      await page.locator('.quickstart-screen').waitFor();
      assert.equal(await page.locator('.draw-choice').count(), 2);
      assert.deepEqual(errors, [], 'no JavaScript page errors');
      results.push({ width, height, coverLinks: 'passed', originalNavigation: 'passed', articleCtas: 'passed', horizontalOverflow: false, pageErrors: errors });
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'browser-audit.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

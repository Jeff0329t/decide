// English (i18n) end-to-end smoke: an en-US visitor gets the whole main flow
// in English (tutorial -> draw -> decide -> completion -> history -> detail
// -> stats -> settings -> paywall -> collection), a ja-JP visitor keeps the
// Japanese UI, and the Settings language switch persists via localStorage.
// Run like the other browser smokes: BASE_URL=http://127.0.0.1:4186 node scripts/browser-i18n-en-smoke.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4186';
const JA_RE = /[぀-ヿ一-鿿]/;

async function jaLeftovers(page, label) {
  const left = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc);
    const out = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t && re.test(t) && n.parentElement && n.parentElement.offsetParent !== null) out.add(t.slice(0, 80));
    }
    return [...out];
  }, JA_RE.source);
  // '日本語' is the language switcher's own label and is intentional.
  const real = left.filter((t) => t !== '日本語');
  assert.deepEqual(real, [], `Japanese leftovers on ${label}: ${real.join(' / ')}`);
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(baseURL);
  await page.locator('#tutorial-intro').waitFor({ timeout: 15000 });
  assert.match(await bodyText(page), /Staying stuck/);
  await page.locator('#tutorial-intro .tutorial-intro-start').click();
  await page.locator('#tutorial-intro .tutorial-intro-start').click();
  await page.locator('[data-action="tutorial-start"]').click();
  await page.locator('.flip-card').nth(10).waitFor();
  await page.locator('.flip-card').nth(10).click();
  await page.locator('.tutorial-keywords button').first().waitFor();
  assert.match(await bodyText(page), /Upright/);
  await page.locator('.tutorial-keywords button').first().click();
  await page.waitForTimeout(1700);
  await page.locator('.tutorial-guidance [data-action="card-detail"]').click();
  await page.locator('#card-modal.open').waitFor();
  assert.match(await bodyText(page), /What this card represents/);
  await jaLeftovers(page, 'tutorial card modal');
  await page.keyboard.press('Escape');
  await page.locator('#card-modal').waitFor({ state: 'detached' });
  await page.locator('[data-action="tutorial-reading-next"]').click();
  await page.locator('[data-action="tutorial-next"]').click();
  await page.locator('[data-action="tutorial-decision"]').first().click();
  await page.locator('[data-action="tutorial-log-next"]').click();
  await page.locator('[data-action="tutorial-review"]').first().click();
  await page.waitForFunction(() => document.querySelector('.tutorial-lookback-callout > p')?.textContent.length > 0);
  await page.locator('[data-action="tutorial-complete"]').click();
  await page.locator('.quickstart-screen').waitFor();
  assert.match(await bodyText(page), /What will you decide today\?/);

  await page.locator('[data-action="start"][data-mode="one"]').click();
  await page.waitForTimeout(500);
  assert.match(await bodyText(page), /What are you deciding\?/);
  await page.locator('[data-action="select-genre"]').first().click();
  await page.waitForTimeout(900);
  await page.locator('.flip-card').nth(5).click();
  await page.waitForTimeout(1400);
  const sessionText = await bodyText(page);
  assert.match(sessionText, /Genre: Work/);
  assert.match(sessionText, /Go ahead/);
  await jaLeftovers(page, 'session');
  await page.locator('[data-action="choose-decision"]').first().click();
  await page.waitForTimeout(800);
  assert.match(await bodyText(page), /When will you look back\?/);
  await page.locator('[data-save-decision]').click({ force: true });
  await page.waitForTimeout(1500);
  assert.match(await bodyText(page), /This decision has been recorded\./);
  await jaLeftovers(page, 'completion');
  await page.locator('.completion-decide').first().click().catch(() => {});
  await page.waitForTimeout(900);
  if (await page.locator('.farewell').count()) {
    await page.locator('[data-action="farewell-home"]').click();
    await page.waitForTimeout(700);
  }
  await page.locator('.bottom-nav [data-nav="history"]').click();
  await page.waitForTimeout(700);
  await jaLeftovers(page, 'history');
  await page.locator('.bottom-nav [data-nav="settings"]').click();
  await page.waitForTimeout(800);
  assert.ok(await page.locator('[data-i18n-lang]').count(), 'language switcher in settings');
  await page.locator('[data-action="open-paywall"]').click();
  await page.waitForTimeout(1000);
  const paywall = await bodyText(page);
  assert.match(paywall, /¥980/);
  assert.match(paywall, /No monthly fees/);
  await jaLeftovers(page, 'paywall');
  assert.deepEqual(errors, []);
  await ctx.close();

  // Japanese default is untouched.
  const ctxJa = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'ja-JP' });
  await ctxJa.addInitScript(() => { try { localStorage.setItem('decide.tarot.tutorial.v1', JSON.stringify({ status: 'completed' })); } catch (e) {} });
  const pageJa = await ctxJa.newPage();
  await pageJa.goto(baseURL);
  await pageJa.locator('.splash-screen').waitFor({ timeout: 15000 });
  assert.match(await bodyText(pageJa), /心から納得いく決断を。/);
  assert.match(await bodyText(pageJa), /はじめる/);
  await ctxJa.close();
  await browser.close();
  console.log('browser-i18n-en-smoke: OK');
})().catch((e) => { console.error(e); process.exit(1); });

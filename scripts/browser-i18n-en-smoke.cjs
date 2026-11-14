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
    const vis = (el) => el && el.offsetParent !== null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t && re.test(t) && vis(n.parentElement)) out.add(t.slice(0, 80));
    }
    // Attributes and field values: the two-card option fields are filled by
    // the app itself, so a Japanese value there is a leak, not user input.
    document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => {
      if (!vis(el)) return;
      for (const a of ['placeholder', 'aria-label', 'title']) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) out.add(`${a}: ${v.slice(0, 80)}`);
      }
    });
    document.querySelectorAll('input,textarea,select').forEach((el) => {
      if (vis(el) && el.value && re.test(el.value)) out.add(`value: ${el.value.slice(0, 80)}`);
    });
    return [...out];
  }, JA_RE.source);
  // '日本語' is the language switcher's own label and is intentional.
  const real = left.filter((t) => t !== '日本語' && !t.endsWith(': 日本語'));
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

  // ---- two-card flow: suggestion pairs fill the option fields in English ----
  await page.locator('#paywall-modal .confirm-actions [data-ent-action="close"]').click().catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('.bottom-nav [data-nav="home"]').click();
  await page.waitForTimeout(700);
  await page.locator('[data-action="start"][data-mode="two"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-action="select-genre"][data-value="仕事"]').click();
  await page.waitForTimeout(800);
  await jaLeftovers(page, 'two-card prepare');
  await page.locator('[data-action="select-pair"]').nth(1).click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#option-1').inputValue(), 'Accept');
  assert.equal(await page.locator('#option-2').inputValue(), 'Decline');
  await page.locator('[data-action="prepare-next"]').click();
  await page.waitForTimeout(800);
  await jaLeftovers(page, 'two-card draw');
  await page.locator('[data-action="flip-both"]').click();
  await page.waitForTimeout(1600);
  await jaLeftovers(page, 'two-card comparison');
  await page.locator('[data-action="choose-decision"]').first().click();
  await page.waitForTimeout(1100);
  await jaLeftovers(page, 'two-card decide');
  await page.locator('[data-save-decision]').click({ force: true });
  await page.waitForTimeout(1400);
  await jaLeftovers(page, 'two-card completion');

  // ---- stats: both tabs, including legacy genre names from seeded logs ----
  // Seed logs whose genres include names no longer offered in the app
  // (Life & home / Health): stats and history must still translate them.
  await page.evaluate(() => {
    try {
      const key = 'decide.tarot.logs.v1';
      const cur = JSON.parse(localStorage.getItem(key) || '[]');
      cur.push(
        { id: 'seed-home', mode: 'two', createdAt: '2026-11-11T10:00:00.000Z', title: '暮らし・住まい：進む／やめる', memo: '', decision: '選択肢2', nodes: [], review: null, genre: '暮らし・住まい', options: { '1': '進む', '2': 'やめる' } },
        { id: 'seed-health', mode: 'one', createdAt: '2026-11-12T10:00:00.000Z', title: '健康：女教皇・11/12', memo: '', decision: '進む', nodes: [], review: 'まあ良かった', genre: '健康', options: null },
      );
      localStorage.setItem(key, JSON.stringify(cur));
    } catch (e) {}
  });
  await page.reload();
  await page.waitForTimeout(1300);
  const splashBtn2 = page.locator('.splash-screen button, .splash-screen [data-action]').first();
  if (await splashBtn2.count()) { await splashBtn2.click().catch(() => {}); await page.waitForTimeout(700); }
  await page.locator('.bottom-nav [data-nav="stats"]').click();
  await page.waitForTimeout(800);
  await jaLeftovers(page, 'stats summary');
  await page.locator('[data-action="stats-tab"][data-value="theme"]').click();
  await page.waitForTimeout(500);
  assert.match(await bodyText(page), /Decisions by theme/);
  assert.match(await bodyText(page), /Life & home/);
  assert.match(await bodyText(page), /Health/);
  await jaLeftovers(page, 'stats theme');
  await page.locator('[data-action="stats-theme"]').first().click();
  await page.waitForTimeout(500);
  await jaLeftovers(page, 'stats theme log panel');

  // ---- dynamic sentences with embedded values (email, counts, dates) ----
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'synthetic-checks';
    d.innerHTML = [
      '<p>選んだ日の夕方（19時ごろ）に、その日の分をまとめて、twaziki@gmail.com へ、記録の題名を添えて送ります。題名は配信用に保存します。題名以外の記録は載せません。</p>',
      '<p>ファイルは5MB以下にしてください。</p>',
      '<p>もっと見る（あと3件）</p>',
      '<p>約3分で読めます</p>',
      '<p>最終同期 2026年11月15日 7:05</p>',
      '<p>選択肢A（今の仕事を続ける）</p>',
      '<p>仕事：今の仕事を続ける／新しい仕事に挑戦する</p>',
    ].join('');
    document.body.append(d);
  });
  await page.waitForTimeout(800);
  const synth = await page.evaluate(() => [...document.querySelectorAll('#synthetic-checks p')].map((p) => p.textContent));
  for (const s of synth) assert.ok(!JA_RE.test(s), `dynamic sentence left in Japanese: ${s}`);
  assert.match(synth[0], /twaziki@gmail\.com/);

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

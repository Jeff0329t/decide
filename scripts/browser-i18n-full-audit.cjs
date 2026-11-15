// Full English audit (companion to browser-i18n-en-smoke.cjs): walks the
// states the smoke does not reach and asserts zero Japanese leftovers in
// visible text, input values, placeholders, aria-labels, titles and alts.
// Covers: tutorial, deck preset details, backup/import sheets, the due-review
// strip on the completion screen, history detail composed lines, the
// consultation share sheet, the shared-link receiver (plain + consultation),
// delete confirmation, composed-string probes, unsubscribe.html and 404.html.
// Run: BASE_URL=http://127.0.0.1:4186 node scripts/browser-i18n-full-audit.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4186';
const JA_RE = /[぀-ヿ一-鿿]/;

async function jaLeftovers(page, { includeAlt = true } = {}) {
  return page.evaluate(({ reSrc, includeAlt }) => {
    const re = new RegExp(reSrc);
    const out = new Set();
    const vis = (el) => el && el.offsetParent !== null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t && re.test(t) && vis(n.parentElement)) out.add(t.slice(0, 90));
    }
    const attrs = ['placeholder', 'aria-label', 'title', ...(includeAlt ? ['alt'] : [])];
    document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach((el) => {
      if (!vis(el)) return;
      for (const a of attrs) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) out.add(`${a}: ${v.slice(0, 90)}`);
      }
    });
    document.querySelectorAll('input[type="text"],input:not([type]),textarea').forEach((el) => {
      if (vis(el) && el.value && re.test(el.value) && !el.closest('[data-i18n-skip]')) out.add(`value: ${el.value.slice(0, 90)}`);
    });
    const title = document.title;
    if (title && re.test(title)) out.add(`TITLE: ${title}`);
    return [...out];
  }, { reSrc: JA_RE.source, includeAlt });
}

async function expectClean(page, label, opts) {
  await page.waitForTimeout(450);
  const left = await jaLeftovers(page, opts);
  // '日本語' is the language switcher's own label and is intentional
  // (same allowance as browser-i18n-en-smoke.cjs).
  const real = left.filter((t) => t !== '日本語' && !t.endsWith(': 日本語'));
  assert.deepEqual(real, [], `${label}: Japanese leftovers: ${JSON.stringify(real, null, 1)}`);
  console.log(`ok - ${label}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const view = { width: 390, height: 844 };

  // ---------- Context A: fresh English visitor ----------
  const ctxA = await browser.newContext({ viewport: view, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'en-US' });
  const page = await ctxA.newPage();
  await page.goto(baseURL + '/');

  // Tutorial: intro pages (segmented phrases) -> draw -> keywords -> reading
  // -> decision -> log -> review -> complete.
  await page.locator('#tutorial-intro').waitFor({ timeout: 15000 });
  await expectClean(page, 'A tutorial intro page 1');
  await page.locator('#tutorial-intro .tutorial-intro-start').click();
  await expectClean(page, 'A tutorial intro page 2');
  await page.locator('#tutorial-intro .tutorial-intro-start').click();
  await expectClean(page, 'A tutorial intro page 3');
  await page.locator('[data-action="tutorial-start"]').click();
  await page.locator('.flip-card').nth(10).waitFor({ timeout: 8000 });
  await expectClean(page, 'A tutorial card grid');
  await page.locator('.flip-card').nth(10).click();
  await page.locator('.tutorial-keywords button').first().waitFor({ timeout: 8000 });
  await expectClean(page, 'A tutorial keywords');
  await page.locator('.tutorial-keywords button').first().click();
  await page.waitForTimeout(1700);
  await expectClean(page, 'A tutorial guidance');
  await page.locator('.tutorial-guidance [data-action="card-detail"]').click();
  await page.locator('#card-modal.open').waitFor({ timeout: 8000 });
  await expectClean(page, 'A tutorial card modal');
  await page.keyboard.press('Escape');
  await page.locator('#card-modal').waitFor({ state: 'detached' });
  await page.locator('[data-action="tutorial-reading-next"]').click();
  await page.locator('[data-action="tutorial-next"]').click();
  await expectClean(page, 'A tutorial decide step');
  await page.locator('[data-action="tutorial-decision"]').first().click();
  await page.locator('[data-action="tutorial-log-next"]').click();
  await page.locator('[data-action="tutorial-review"]').first().click();
  await page.waitForFunction(() => document.querySelector('.tutorial-lookback-callout > p')?.textContent.length > 0);
  await expectClean(page, 'A tutorial review step');
  await page.locator('[data-action="tutorial-complete"]').click();
  await page.locator('.quickstart-screen').waitFor({ timeout: 8000 });
  await expectClean(page, 'A home quickstart');

  // Settings: deck presets detail (benefit / drawback lines render per preset)
  await page.locator('.bottom-nav [data-nav="settings"]').click();
  await page.waitForTimeout(700);
  if (!(await page.locator('.settings-screen').count())) {
    await page.evaluate(() => { document.querySelector('[data-nav="settings"]')?.click(); });
  }
  await page.locator('.settings-screen').waitFor({ timeout: 8000 });
  for (const preset of await page.locator('[data-action="deck-preset"]').all()) {
    await preset.click();
    await expectClean(page, 'A settings deck preset detail');
  }
  // Backup help + import modal wording
  const helpBtn = page.locator('button').filter({ hasText: 'How backup works' }).first();
  if (await helpBtn.count()) { await helpBtn.click(); await page.waitForTimeout(500); await expectClean(page, 'A backup help sheet'); await page.keyboard.press('Escape'); }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expectClean(page, 'A settings bottom');

  // Composed-string probes (strings built by JS templates, checked directly)
  // Embedded option/decision text uses English here on purpose: text the
  // user typed is user data and must pass through untranslated.
  const probes = [
    '選択肢A：Go · 選択肢Aを選んだとき',
    '選択肢B · 選択肢Bを選んだとき',
    '選んだ答え：選択肢A　（カードの視点でもおすすめでした）',
    '選んだ答え：選択肢B　（カードの視点では、今回は保留をおすすめします）',
    '選んだ答え：Go　（カードの視点では、Aが進めやすそうでした。決めたのは本人です）',
    '選んだ答え：選択肢A',
    '私はAを選んだ。あなたは？',
    '私はBを選んだ',
    '最終書き出し：11/15 07:05',
    '引いたカード：愚者／「自由」',
    'カード1枚と、このときの決定「Go」を共有します。',
    '共有する選択肢A',
    '愚者を選びました',
    '愚者を開きました',
    '選択肢1',
    '選択肢 2',
    '← 最初に戻る',
  ];
  const probeLeft = await page.evaluate(async (items) => {
    const re = /[぀-ヿ一-鿿]/;
    const host = document.createElement('div');
    document.body.append(host);
    const spans = items.map((s) => { const sp = document.createElement('span'); sp.textContent = s; host.append(sp); return sp; });
    await new Promise((r) => setTimeout(r, 900));
    const out = items.filter((s, i) => re.test(spans[i].textContent));
    host.remove();
    return out;
  }, probes);
  assert.deepEqual(probeLeft, [], `probes still Japanese: ${JSON.stringify(probeLeft)}`);
  console.log('ok - A composed-string probes');

  // Attribute probes: alt / aria-label strings the walk may not surface
  const attrLeft = await page.evaluate(async () => {
    const re = /[぀-ヿ一-鿿]/;
    const host = document.createElement('div');
    document.body.append(host);
    const img = document.createElement('img');
    img.setAttribute('alt', 'DECIDE. のロゴと「心から納得いく決断を。」のコピー、扉へ続く階段とタロットカードのコラージュ');
    host.append(img);
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'メインナビゲーション');
    host.append(btn);
    const card = document.createElement('img');
    card.setAttribute('alt', '愚者');
    host.append(card);
    await new Promise((r) => setTimeout(r, 900));
    const out = [img.getAttribute('alt'), btn.getAttribute('aria-label'), card.getAttribute('alt')].filter((v) => v && re.test(v));
    host.remove();
    return out;
  });
  assert.deepEqual(attrLeft, [], `attribute probes still Japanese: ${JSON.stringify(attrLeft)}`);
  console.log('ok - A attribute probes');

  // Tutorial segmented intro lines: the real TUTORIAL_INTRO_PAGES phrases,
  // split on ｜ exactly as phraseText() renders them.
  const segLeft = await page.evaluate(async () => {
    const re = /[぀-ヿ一-鿿]/;
    const phrases = [
      '心から｜納得いく｜決断を。',
      '迷ったまま、｜時間が｜過ぎたり。\n勢いで決めて、｜あとで｜後悔したり。',
      'そんなこと、｜ありませんか？',
      'DECIDE.は、\n自分で選んで｜「これでよかった」と｜思えるための｜アプリです。',
      'タロットは、｜心を映す鏡。',
      'タロットは、｜78枚の｜絵のカードです。\n未来を｜当てるためではなく、\n自分で｜決めるために｜使います。',
      'コインを｜投げた瞬間、\n「表が出てほしい」と｜思ったら、\nそれが｜本音。',
      'カードも｜同じです。',
      '占いを｜信じなくても、｜使えます。',
      '引く。｜決める。｜振り返る。',
      '1回、｜練習してみましょう。',
      '例：｜「久しぶりの友人に、｜連絡してみる？」',
    ];
    const host = document.createElement('div');
    document.body.append(host);
    const spans = [];
    // phraseText() splits on ｜ and renders \n as a line break, so the real
    // text nodes never span a newline: probe the pieces the same way.
    for (const p of phrases) for (const seg of p.split(/[｜\n]/)) { const sp = document.createElement('span'); sp.textContent = seg; host.append(sp); spans.push(sp); }
    await new Promise((r) => setTimeout(r, 900));
    const out = spans.map((sp) => sp.textContent).filter((t) => re.test(t));
    host.remove();
    return out;
  });
  assert.deepEqual(segLeft, [], `tutorial segments still Japanese: ${JSON.stringify(segLeft)}`);
  console.log('ok - A tutorial segments');
  await ctxA.close();

  // ---------- Context B: real-shaped logs (due review + history + share) ----------
  // A hand-written seed log does not match the app's node shape, so phase 1
  // lets the app itself save a log; phase 2 rewinds that log's dates to make
  // it due, then draws again so the completion screen shows the review strip.
  const ctxB = await browser.newContext({ viewport: view, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'en-US' });
  await ctxB.addInitScript(() => {
    try { localStorage.setItem('decide.tarot.tutorial.v1', JSON.stringify({ status: 'completed' })); } catch (e) { /* ignore */ }
  });
  const pageB = await ctxB.newPage();
  const fullDraw = async () => {
    await pageB.locator('.home-screen, .app-shell').first().waitFor({ timeout: 15000 });
    await pageB.waitForTimeout(700);
    if (await pageB.locator('.splash-screen').count()) {
      await pageB.locator('[data-action="start-app"]').first().click();
      await pageB.locator('.quickstart-screen').waitFor({ timeout: 8000 });
    }
    await pageB.locator('[data-action="start"]').nth(1).click(); // DUEL (two-card)
    await pageB.locator('[data-action="select-genre"]').first().waitFor({ timeout: 8000 });
    await pageB.locator('[data-action="select-genre"]').first().click();
    await pageB.locator('#option-1').waitFor({ timeout: 8000 });
    await pageB.locator('#option-1').fill('Go');
    await pageB.locator('#option-2').fill('Stop');
    await pageB.locator('[data-action="prepare-next"]').click();
    await pageB.locator('.draw-screen').waitFor({ timeout: 8000 });
    // The reveal button is press-and-hold.
    await pageB.locator('[data-action="flip-both"]').click({ delay: 1100 });
    await pageB.waitForTimeout(1200);
    if (!(await pageB.locator('[data-action="choose-decision"]').count())) {
      await pageB.locator('[data-action="decide"]').click();
      await pageB.waitForTimeout(600);
    }
    await pageB.locator('[data-action="choose-decision"]').first().waitFor({ timeout: 8000 });
    await pageB.locator('[data-action="choose-decision"]').first().click();
    await pageB.locator('[data-save-decision]').waitFor({ timeout: 8000 });
    await pageB.locator('[data-save-decision]').click();
    await pageB.locator('.completion-screen').waitFor({ timeout: 8000 });
  };
  await pageB.goto(baseURL + '/');
  await fullDraw();
  await expectClean(pageB, 'B completion (first draw)');
  await pageB.evaluate(() => {
    const logs = JSON.parse(localStorage.getItem('decide.tarot.logs.v1') || '[]');
    const log = logs[0];
    const past = new Date(Date.now() - 4 * 864e5).toISOString();
    log.createdAt = past;
    log.title = 'Audit decision';
    log.remindAt = new Date(Date.now() - 864e5).toISOString();
    log.dueStatus = 'pending';
    localStorage.setItem('decide.tarot.logs.v1', JSON.stringify([log]));
  });
  await pageB.goto(baseURL + '/');
  await fullDraw();
  await expectClean(pageB, 'B completion with due-review strip');

  // History detail: composed saved-card line + card image alt.
  // The completion screen has no bottom nav: confirm and go home first.
  await pageB.locator('.completion-screen [data-action="satisfied"]').click();
  await pageB.waitForTimeout(1000);
  if (await pageB.locator('[data-action="farewell-home"]').count()) {
    await pageB.locator('[data-action="farewell-home"]').click();
    await pageB.waitForTimeout(800);
  }
  if (await pageB.locator('.splash-screen').count()) {
    await pageB.locator('[data-action="start-app"]').first().click();
    await pageB.waitForTimeout(800);
  }
  await pageB.locator('.bottom-nav [data-nav="history"]').click();
  await pageB.locator('.history-screen').waitFor({ timeout: 8000 });
  await expectClean(pageB, 'B history list');
  await pageB.locator('.history-item').first().click();
  await pageB.locator('.detail-screen').waitFor({ timeout: 8000 });
  await expectClean(pageB, 'B history detail');

  // Consultation share sheet (opened from the detail screen)
  await pageB.locator('[data-action="share-log"]').first().click();
  await pageB.locator('.consultation-sheet').waitFor({ timeout: 8000 });
  await pageB.waitForTimeout(1200);
  await expectClean(pageB, 'B consultation share sheet');
  await pageB.locator('.consultation-sheet .sheet-bottom-close').click();
  await pageB.waitForTimeout(600);

  // Delete confirmation sheet (danger-zone button on the detail screen)
  await pageB.locator('[data-action="delete-log"]').first().click();
  await pageB.locator('.confirm-sheet').waitFor({ timeout: 8000 });
  await pageB.waitForTimeout(500);
  await expectClean(pageB, 'B delete confirmation');
  await ctxB.close();

  // ---------- Shared-link receiver (plain + consultation) ----------
  const ctxC = await browser.newContext({ viewport: view, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'en-US' });
  const pageC = await ctxC.newPage();
  const enc = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  // Deck ids are M0.. (major) / suit-coded (minor); consultation "a" is
  // 0 = undecided, 1 = A, 2 = B, matching consultation-share.js payload().
  // Hash-only navigations do not reboot the app, so go via about:blank.
  const openShare = async (hash) => {
    await pageC.goto('about:blank');
    await pageC.goto(baseURL + '/#share=' + hash);
    await pageC.locator('.shared-screen').waitFor({ timeout: 10000 });
    await pageC.waitForTimeout(900);
  };
  await openShare('invalid-link');
  await expectClean(pageC, 'C shared view (invalid link)');
  // d / t / s are the sender's own text (user data): English here, as an
  // English sender's payload would carry.
  await openShare(enc({ d: 'I decided to go ahead', c: [['M0', 0]], t: 'Record', s: '' }));
  await expectClean(pageC, 'C shared view (plain)', { includeAlt: true });
  await openShare(enc({ k: 1, d: 'まだ決めていない', c: [['M0', 0], ['M1', 1]], q: ['進む', 'やめる'], a: 0, n: '' }));
  await expectClean(pageC, 'C shared view (consultation, undecided)');
  await openShare(enc({ k: 1, d: '選択肢1', c: [['M0', 0], ['M1', 1]], q: ['進む', 'やめる'], a: 1, n: '' }));
  await pageC.locator('.consultation-received').waitFor({ timeout: 10000 });
  await pageC.waitForTimeout(800);
  await expectClean(pageC, 'C shared view (consultation, chose A)');
  const outcome = await pageC.evaluate(() => document.body.innerText.includes('I chose Option A. What about you?'));
  assert.ok(outcome, 'consultation outcome line is translated');
  console.log('ok - C consultation outcome line');
  await ctxC.close();

  // ---------- Standalone pages ----------
  const ctxD = await browser.newContext({ viewport: view, locale: 'en-US', serviceWorkers: 'block' });
  const pageD = await ctxD.newPage();
  await pageD.goto(baseURL + '/unsubscribe.html');
  await pageD.waitForTimeout(600);
  await expectClean(pageD, 'D unsubscribe (invalid link state)');
  assert.equal(await pageD.title(), 'Stop reminder emails — DECIDE.');
  await pageD.goto(baseURL + '/404.html');
  await pageD.waitForTimeout(400);
  await expectClean(pageD, 'D 404 page');
  assert.equal(await pageD.title(), 'Page not found - DECIDE.');
  const hrefs = await pageD.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
  assert.ok(hrefs.includes('/en/cards/') && hrefs.includes('/en/cards/worries'), '404 links point to /en/');
  console.log('ok - D 404 links rewritten');
  await ctxD.close();

  await browser.close();
  console.log('FULL I18N AUDIT PASSED');
}

main().catch((error) => { console.error(error); process.exit(1); });

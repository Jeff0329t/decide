const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const baseURL=process.env.BASE_URL || 'http://127.0.0.1:4186';
const out=path.resolve(__dirname,'../docs/tutorial-2026-10-18');fs.mkdirSync(out,{recursive:true});
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'});const errors=[];
for(const [width,height] of [[320,568],[390,844],[430,932]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL);
 await page.locator('#tutorial-intro').waitFor();
 assert.match(await page.locator('#tutorial-intro').innerText(),/練習の内容は保存されません/);
 assert.ok(await page.locator('#tutorial-intro h2').evaluate(el=>el.getBoundingClientRect().top>=0));
 await page.screenshot({path:`${out}/${width}-intro.png`,fullPage:true});
 await page.locator('[data-action="tutorial-start"]').click();
 await page.locator('.flip-card').nth(10).click();
 await page.locator('.tutorial-keywords button').first().waitFor();
 await page.locator('.tutorial-keywords button').first().click();
 // Reading stays under the user's control, even after the former automatic timeout.
 await page.waitForTimeout(1600);
 await page.locator('[data-action="tutorial-reading-next"]').waitFor();
 await page.screenshot({path:`${out}/${width}-reading.png`,fullPage:true});
 await page.locator('.tutorial-guidance [data-action="card-detail"]').click();
 await page.locator('#card-modal.open').waitFor();
 assert.match(await page.locator('#card-modal').innerText(),/絵柄と背景/);
 await page.screenshot({path:`${out}/${width}-meaning.png`,fullPage:true});
 await page.keyboard.press('Escape');
 await page.locator('#card-modal').waitFor({state:'detached'});
 // Closing meaning must return to the tutorial, not skip it.
 await page.locator('[data-action="tutorial-reading-next"]').click();
 await page.locator('[data-action="tutorial-next"]').click();
 await page.locator('[data-action="tutorial-decision"]').first().click();
 await page.locator('[data-action="tutorial-log-next"]').click();
 await page.locator('[data-action="tutorial-review"]').first().click();
 assert.match(await page.locator('#tutorial-intro').innerText(),/設定の「カード図鑑」/);
 await page.screenshot({path:`${out}/${width}-finish.png`,fullPage:true});
 await page.locator('[data-action="tutorial-complete"]').click();
 await page.locator('.quickstart-screen').waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.tutorial.v1')).status),'completed');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.logs.v1')||'[]').length),0);
 assert.equal(await page.locator('#tutorial-intro').count(),0);
 await page.reload();await page.locator('.splash-screen').waitFor();assert.equal(await page.locator('#tutorial-intro').count(),0);
 await page.locator('.splash-hit').click();
 await page.locator('[data-action="tutorial-open"]').click();await page.locator('#tutorial-intro').waitFor();
 await page.locator('[data-action="tutorial-skip"]').click();await page.locator('.quickstart-screen').waitFor();
 assert.equal(await page.evaluate(()=>document.querySelector('#app').inert),false);
 await page.reload();await page.locator('.splash-screen').waitFor();assert.equal(await page.locator('#tutorial-intro').count(),0);
 console.log('PASS',width,height,'first visit, manual reading, meaning + Escape, full trial, no logs, reload, replay, skip');
 await context.close();
}
// Existing logs should prevent unexpected first-use prompts.
const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
await page.addInitScript(()=>localStorage.setItem('decide.tarot.logs.v1',JSON.stringify([{id:'existing',title:'既存の記録',createdAt:new Date().toISOString(),mode:'one',decision:'保留する',nodes:[]}])));
await page.goto(baseURL);await page.locator('.splash-screen').waitFor();assert.equal(await page.locator('#tutorial-intro').count(),0);
console.log('PASS existing user');await context.close();
const standalone=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const sp=await standalone.newPage();sp.on('pageerror',e=>errors.push(e.message));
await sp.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
await sp.goto(baseURL);await sp.locator('.app-viewport #tutorial-intro').waitFor();
await sp.locator('[data-action="tutorial-start"]').click();await sp.locator('.flip-card').nth(10).click();
await sp.locator('.tutorial-guidance [data-action="card-detail"]').click();await sp.locator('.app-viewport #card-modal.open').waitFor();
await sp.locator('#card-modal .card-detail-close').click();await sp.locator('#card-modal').waitFor({state:'detached'});
await sp.locator('[data-action="tutorial-skip"]').click();
assert.equal(await sp.evaluate(()=>document.querySelector('#app').inert),false);
console.log('PASS standalone shell and meaning close');await standalone.close();
assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

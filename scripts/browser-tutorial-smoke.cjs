const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const baseURL=process.env.BASE_URL || 'http://127.0.0.1:4186';
const out=path.resolve(__dirname,'../docs/tutorial-concept-2026-10-22');fs.mkdirSync(out,{recursive:true});
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'});const errors=[];
for(const [width,height] of [[320,568],[390,844],[430,932]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL);
 await page.locator('#tutorial-intro').waitFor();
 // WHY -> WHAT -> HOW, each page fully visible with its primary button.
 for(const [name,copy] of [['why',/心から納得いく決断を。/],['what',/タロットは、心を映す鏡。[\s\S]*占いを信じなくても、使えます。/],['how',/引く。決める。振り返る。[\s\S]*練習は保存されません/]]){
  assert.match(await page.locator('#tutorial-intro').innerText(),copy);
  assert.ok(await page.locator('#tutorial-intro h2').evaluate(el=>el.getBoundingClientRect().top>=0));
  const primary=page.locator('#tutorial-intro .tutorial-intro-start');
  assert.ok(await primary.evaluate(el=>document.activeElement===el),`${name} focuses the primary button`);
  await page.screenshot({path:`${out}/${width}-intro-${name}.png`,fullPage:true});
  if(name!=='how')await primary.click();
 }
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
 assert.match(await page.locator('#card-modal').innerText(),/絵に描かれているもの/);
 await page.screenshot({path:`${out}/${width}-meaning.png`,fullPage:true});
 await page.keyboard.press('Escape');
 await page.locator('#card-modal').waitFor({state:'detached'});
 // Closing meaning must return to the tutorial, not skip it.
 await page.locator('[data-action="tutorial-reading-next"]').click();
 await page.locator('[data-action="tutorial-next"]').click();
 await page.locator('[data-action="tutorial-decision"]').first().click();
 await page.locator('[data-action="tutorial-log-next"]').click();
 await page.locator('[data-action="tutorial-review"]').first().click();
 await page.waitForFunction(()=>document.querySelector('.tutorial-lookback-callout > p')?.textContent.length>0);
 assert.match(await page.locator('#tutorial-intro').innerText(),/「設定」→「カード図鑑」/);
 await page.screenshot({path:`${out}/${width}-finish.png`,fullPage:true});
 await page.locator('[data-action="tutorial-complete"]').click();
 await page.locator('.quickstart-screen').waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.tutorial.v1')).status),'completed');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.logs.v1')||'[]').length),0);
 assert.equal(await page.locator('#tutorial-intro').count(),0);
 await page.reload();await page.locator('.splash-screen').waitFor();assert.equal(await page.locator('#tutorial-intro').count(),0);
 const help=page.locator('.splash-help');
 const box=await help.boundingBox();assert.ok(box && box.y>=0 && box.y+box.height<=height-60,'cover help is above navigation');
 const atlas=page.locator('.splash-atlas');const atlasBox=await atlas.boundingBox();
 assert.ok(atlasBox && atlasBox.x>=box.x+box.width && Math.abs(atlasBox.y-box.y)<1 && atlasBox.x+atlasBox.width<=width,'cover links are side by side');
 await page.screenshot({path:`${out}/${width}-cover-help.png`,fullPage:true});
 await atlas.click();await page.locator('.learn-tile').first().waitFor();assert.equal(await page.locator('.learn-tile').count(),78);
 await page.locator('.learn-tile').first().click();await page.locator('#card-modal.open').waitFor();
 await page.locator('#card-modal .card-detail-close').click();await page.locator('#card-modal').waitFor({state:'detached'});
 await page.locator('.bottom-nav [data-action="nav-back"]').click();await page.locator('.splash-screen').waitFor();
 await help.click();await page.locator('#tutorial-intro').waitFor();
 await page.locator('[data-action="tutorial-skip"]').click();await page.locator('.quickstart-screen').waitFor();
 assert.equal(await page.evaluate(()=>document.querySelector('#app').inert),false);
 await page.reload();await page.locator('.splash-screen').waitFor();assert.equal(await page.locator('#tutorial-intro').count(),0);
 await page.locator('.splash-start button').click();await page.locator('.quickstart-screen').waitFor();
 await page.locator('.quickstart-help').click();await page.locator('#tutorial-intro').waitFor();
 await page.locator('[data-action="tutorial-skip"]').click();
 console.log('PASS',width,height,'first visit, manual reading, meaning + Escape, full trial, no logs, reload, replay, skip');
 await context.close();
}
// Existing logs should prevent unexpected first-use prompts.
const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
await page.addInitScript(()=>localStorage.setItem('decide.tarot.logs.v1',JSON.stringify([{id:'existing',title:'既存の記録',createdAt:new Date().toISOString(),mode:'one',decision:'保留する',nodes:[]}])));
await page.goto(baseURL);await page.locator('.splash-screen').waitFor();assert.equal(await page.locator('#tutorial-intro').count(),0);
console.log('PASS existing user');await context.close();
// A user who turned on all 78 cards with reversals still practises with 22 upright major cards.
const rev=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const rp=await rev.newPage();rp.on('pageerror',e=>errors.push(e.message));
await rp.addInitScript(()=>{ if(!sessionStorage.getItem('seeded')){ localStorage.setItem('decide.tarot.settings.v1',JSON.stringify({deckMode:'all-reversed'})); sessionStorage.setItem('seeded','1'); } });
for(let round=0;round<5;round++){
 await rp.goto(baseURL);await rp.locator('#tutorial-intro').waitFor();
 await rp.locator('[data-action="tutorial-intro-next"]').click();await rp.locator('[data-action="tutorial-intro-next"]').click();
 await rp.locator('[data-action="tutorial-start"]').click();await rp.locator('.flip-card').nth(10).waitFor();
 const deck=await rp.evaluate(()=>({count:activeSession.drawOptions.length,upright:activeSession.drawOptions.every(card=>card.orientation==='upright'),major:activeSession.drawOptions.every(card=>MAJOR.some(major=>major.id===card.id))}));
 assert.deepEqual(deck,{count:22,upright:true,major:true});
 await rp.locator('.flip-card').nth(10).click();await rp.locator('.tutorial-keywords button').first().waitFor();
 assert.equal(await rp.evaluate(()=>activeSession.nodes[0].card.orientation),'upright');
 await rp.locator('[data-action="tutorial-skip"]').click();
 assert.equal(await rp.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.settings.v1')).deckMode),'all-reversed');
 await rp.evaluate(()=>localStorage.removeItem('decide.tarot.tutorial.v1'));
}
console.log('PASS reversed-deck user practises with 22 upright major cards');await rev.close();
const standalone=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const sp=await standalone.newPage();sp.on('pageerror',e=>errors.push(e.message));
await sp.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
await sp.goto(baseURL);await sp.locator('.app-viewport #tutorial-intro').waitFor();
await sp.locator('[data-action="tutorial-intro-next"]').click();await sp.locator('[data-action="tutorial-intro-next"]').click();
await sp.locator('[data-action="tutorial-start"]').click();await sp.locator('.flip-card').nth(10).click();
await sp.locator('.tutorial-guidance [data-action="card-detail"]').click();await sp.locator('.app-viewport #card-modal.open').waitFor();
await sp.locator('#card-modal .card-detail-close').click();await sp.locator('#card-modal').waitFor({state:'detached'});
await sp.locator('[data-action="tutorial-skip"]').click();
assert.equal(await sp.evaluate(()=>document.querySelector('#app').inert),false);
console.log('PASS standalone shell and meaning close');await standalone.close();
assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const baseURL=process.env.BASE_URL||'http://127.0.0.1:4199';const out=path.resolve(__dirname,'../docs/card-back-library-2026-10-29');
const ids=['ivory-orbit','rose-moon','moonlit-navy','obsidian-brass','midnight-compass','forest-orbit'];
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],results=[];
for(const [width,height] of [[320,568],[390,844],[430,932]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL).origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!sessionStorage.getItem('card-back-test-seeded')){localStorage.setItem('decide.tarot.tutorial.v1','done');localStorage.setItem('decide.tarot.settings.v1',JSON.stringify({back:'deleted-back',feedback:false,deckMode:'major-upright'}));sessionStorage.setItem('card-back-test-seeded','1');}});
 await page.goto(baseURL);await page.locator('.splash-screen').waitFor();
 await page.locator('.bottom-nav [data-nav="settings"]').click();await page.locator('.back-choice').first().waitFor();assert.equal(await page.locator('.back-choice').count(),7);assert.equal(await page.locator('[data-action="select-back"][data-value="celestial"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'settings overflow');
 for(const id of ids){
  const button=page.locator(`[data-action="select-back"][data-value="${id}"]`);await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.back-choice[aria-pressed="true"]').count(),1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.settings.v1')).back),id);
  const style=await button.locator('.card-back').evaluate(el=>({background:getComputedStyle(el).backgroundImage,before:getComputedStyle(el,'::before').content,border:getComputedStyle(el).borderTopWidth}));assert.ok(style.background.includes(`${id}.webp`));assert.equal(style.before,'none');assert.equal(style.border,'0px');
  const decoded=await page.evaluate(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve([i.naturalWidth,i.naturalHeight]);i.onerror=()=>resolve([]);i.src=src;}),`${baseURL}/assets/card-backs/${id}.webp`);assert.deepEqual(decoded,[500,800]);
 }
 // Native keyboard activation and persisted selection after a real reload.
 const rose=page.locator('[data-action="select-back"][data-value="rose-moon"]');await rose.focus();await page.keyboard.press('Enter');
 await page.reload();await page.locator('.bottom-nav [data-nav="settings"]').click();await page.locator('.back-choice').first().waitFor();assert.equal(await page.locator('[data-value="rose-moon"]').getAttribute('aria-pressed'),'true');
 await page.locator('.back-choice').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-settings-top.png`)});await page.locator('.back-choice').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-settings-bottom.png`)});
 if(width===390)await page.locator('.setting-backs').screenshot({path:path.join(out,'390-picker.png')});
 await page.locator('.bottom-nav [data-nav="home"]').click();if(await page.locator('.splash-start button').isVisible())await page.locator('.splash-start button').click();await page.locator('.quickstart-screen').waitFor();assert.equal(await page.locator('.mode-art .back-rose-moon').count(),3);await page.screenshot({path:path.join(out,`${width}-home.png`)});
 await page.locator('[data-action="start"][data-mode="one"]').click();await page.locator('[data-action="select-genre"]').first().click();await page.locator('.fan-deck').waitFor();assert.ok(await page.locator('.flip-back.back-rose-moon').count()>0);assert.deepEqual(await page.locator('.flip-back.back-rose-moon').first().evaluate(el=>[getComputedStyle(el).borderTopWidth,getComputedStyle(el).filter]),['0px','none']);await page.screenshot({path:path.join(out,`${width}-one-draw.png`)});
 await page.locator('.flip-card').nth(10).click({force:true});await page.locator('.one-result').waitFor();const front=page.locator('.one-result img').first();await front.waitFor();assert.ok((await front.getAttribute('src')).includes('rider-waite'));
 await page.locator('.bottom-nav [data-nav="settings"]').click();await page.locator('[data-action="select-back"][data-value="moonlit-navy"]').click();await page.locator('.bottom-nav [data-nav="home"]').click();await page.locator('[data-action="start"][data-mode="two"]').click();await page.locator('[data-action="select-genre"]').first().click();await page.locator('[data-action="prepare-skip"]').click();await page.locator('.draw-two').waitFor();assert.equal(await page.locator('.flip-back.back-moonlit-navy').count(),2);
 const border=await page.locator('.flip-back.back-moonlit-navy').first().evaluate(el=>getComputedStyle(el).borderTopWidth);assert.equal(border,'0px');await page.screenshot({path:path.join(out,`${width}-two-draw.png`)});
 await page.locator('[data-action="flip-both"]').focus();await page.keyboard.press('Enter');await page.locator('.two-result').waitFor();assert.equal(await page.locator('.two-result .compare-card').count(),2);
 await page.locator('.bottom-nav [data-nav="settings"]').click();await page.locator('[data-action="select-back"][data-value="celestial"]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.settings.v1')).back),'celestial');
 let offline=false;
 if(width===390){
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.waitForFunction(async ids=>{const c=await caches.open('decide-shell-editorial-v253');return (await Promise.all(ids.map(id=>c.match('./assets/card-backs/'+id+'.webp')))).every(Boolean);},ids);
  await context.setOffline(true);await page.reload();await page.locator('.splash-screen').waitFor();await page.locator('.bottom-nav [data-nav="settings"]').click();
  await page.locator('[data-action="select-back"][data-value="forest-orbit"]').click();const available=await page.evaluate(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth);i.onerror=()=>resolve(0);i.src=src;}),baseURL+'/assets/card-backs/forest-orbit.webp');assert.equal(available,500);
  await page.locator('.setting-backs').screenshot({path:path.join(out,'390-offline-picker.png')});offline=true;
 }
 results.push({width,height,choices:7,artworkImagesDecoded:6,persistedAfterReload:true,oneDraw:true,twoDraw:true,restoredOriginal:true,offline});console.log('PASS',JSON.stringify(results.at(-1)));await context.close();
}
assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'browser-checks.json'),JSON.stringify({results,errors},null,2)+'\n');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

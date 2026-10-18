const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const baseURL=process.env.BASE_URL || 'http://127.0.0.1:4186';
const root=path.resolve(__dirname,'..');const expected=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/cards.json'),'utf8'));
const out=path.join(root,'docs/cards-plain-2026-10-18');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});const errors=[];
async function atlas(width,height){const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('decide.tarot.tutorial.v1','done'));await page.goto(baseURL);await page.locator('.bottom-nav [data-action="open-settings"]').click();await page.locator('[data-action="open-learn"]').click();await page.locator('.learn-tile').first().waitFor();assert.equal(await page.locator('.learn-tile').count(),78);return {context,page};}
const {context,page}=await atlas(390,844);
await page.locator('.learn-tile').first().click();
const audit=await page.evaluate(async data=>{
 const frame=()=>new Promise(requestAnimationFrame);let meanings=0,questions=0;
 for(let index=0;index<data.cards.length;index++){
  const card=data.cards[index];
  if(index)document.querySelector('#card-modal [data-learn="next"]').click();
  await frame();
  for(const direction of ['upright','reversed']){
   document.querySelector(`#card-modal [data-direction="${direction}"]`).click();await frame();
   const modal=document.querySelector('#card-modal');
   if(modal.querySelector('.card-detail-header h3').textContent!==card.name)throw Error(`wrong card ${card.id}`);
   if(modal.querySelector('.direction-meaning').textContent!==card[direction].meaning)throw Error(`wrong meaning ${card.id} ${direction}`);
   const text=modal.textContent;if(!text.includes(card.story)||!text.includes(card.background))throw Error(`missing explanation ${card.id}`);
   if(!text.includes('正位置は、ふつうの向き。'))throw Error(`missing direction help ${card.id}`);
   meanings++;
   for(const key of Object.keys(data.themes)){
    modal.querySelector(`[data-learn="theme"][data-theme="${key}"]`).click();
    if(modal.querySelector('.theme-panel p').textContent!==card[direction].themes[key])throw Error(`wrong question ${card.id} ${direction} ${key}`);
    if(modal.querySelector('.theme-panel b').textContent!==data.themes[key])throw Error(`wrong label ${key}`);
    questions++;
   }
  }
 }
 return {cards:data.cards.length,meanings,questions};
},expected);
assert.deepEqual(audit,{cards:78,meanings:156,questions:780});console.log('PASS all card details',JSON.stringify(audit));
await page.locator('#card-modal [data-learn="close-card"]').last().click();await page.locator('#card-modal').waitFor({state:'detached'});
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.logs.v1')||'[]').length),0);
await context.close();
for(const width of [320,390,430]){
 const {context,page}=await atlas(width,width===320?568:844);
 for(const id of ['ar00','ar13','sw08','pe13']){
  const card=expected.cards.find(c=>c.id===id);await page.locator('#learn-search').fill(card.name);await page.locator('.learn-tile').first().click();await page.locator('#card-modal.open').waitFor();
  const sheet=page.locator('.card-detail-sheet');
  assert.equal(await sheet.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${width} ${id} sheet overflow`);
  await page.screenshot({path:path.join(out,`${width}-${id}-upright.png`)});
  await page.locator('[data-direction="reversed"]').click();await page.locator('#card-modal.open').waitFor();
  assert.equal(await page.locator('.direction-meaning').textContent(),card.reversed.meaning);
  await page.screenshot({path:path.join(out,`${width}-${id}-reversed.png`)});
  await page.locator('#card-modal [data-learn="close-card"]').last().click();await page.locator('#card-modal').waitFor({state:'detached'});
 }
 console.log('PASS responsive details',width);await context.close();
}
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-audit.json'),JSON.stringify({audit,widths:[320,390,430],errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

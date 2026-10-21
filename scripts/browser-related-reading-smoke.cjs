const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),baseURL=process.env.BASE_URL || 'http://127.0.0.1:4186';
const content=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/related-articles.json'),'utf8'));
const learn=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/learn.json'),'utf8'));
const out=path.join(root,'docs/related-learning-2026-10-18');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[];
async function open(width,height){const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('decide.tarot.tutorial.v1','done'));await page.goto(baseURL);await page.locator('.splash-atlas').click();await page.locator('.learn-tile').first().waitFor();return {context,page};}
for(const width of [320,390,430]){
 const {context,page}=await open(width,width===320?568:844);let articleRequests=0;page.on('request',r=>{if(r.url().includes('related-articles.json'))articleRequests++;});
 assert.equal(await page.locator('.learn-tab').count(),3);assert.equal(articleRequests,0);
 await page.locator('[data-tab="articles"]').click();await page.locator('.learn-article-item').first().waitFor();
 assert.equal(await page.locator('.learn-article-count').textContent(),'126件の記事');assert.equal(await page.locator('.learn-article-item').count(),12);assert.equal(articleRequests,1);
 assert.ok((await page.locator('.learn-article-item').first().boundingBox()).y<(width===320?568:844)-70,'first article begins above bottom navigation');
 await page.screenshot({path:path.join(out,`${width}-articles.png`),fullPage:false});
 await page.locator('[data-learn="article-more"]').click();assert.equal(await page.locator('.learn-article-item').count(),24);
 await page.locator('#learn-article-search').fill('アルゴリズム');assert.ok(await page.locator('.learn-article-item').count()>0);
 const title=await page.locator('.learn-article-item strong').first().textContent();await page.locator('.learn-article-item').first().click();assert.equal(await page.locator('.learn-article-reader > h2').textContent(),title);
 assert.equal(await page.locator('.learn-article-body script,.learn-article-body iframe').count(),0);
 await page.screenshot({path:path.join(out,`${width}-reader.png`)});
 assert.equal(await page.locator('.learn-article-reader').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 await page.locator('.bottom-nav [data-action="nav-back"]').click();assert.equal(await page.locator('#learn-article-search').inputValue(),'アルゴリズム');
 await page.locator('#learn-article-search').fill('this-word-is-not-present-xyz');await page.getByText('見つかりませんでした。別の言葉で探してみてください。').waitFor();
 await page.locator('#learn-article-search').fill('');await page.locator('[data-learn="article-filter"][data-category="relationships"]').click();
 assert.equal(await page.locator('.learn-article-count').textContent(),`${content.articles.filter(a=>a.category==='relationships').length}件の記事`);
 await page.locator('[data-tab="lessons"]').click();assert.equal(await page.locator('.learn-lesson-item').count(),6);
 for(const lesson of learn.lessons){
  await page.locator(`[data-learn="lesson"][data-id="${lesson.id}"]`).click();assert.equal(await page.locator('.learn-lessons > h2').textContent(),lesson.title);
  assert.deepEqual(await page.locator('.learn-lessons > p:not(.learn-kicker)').allTextContents(),lesson.body);
  if(lesson.id==='l6')await page.screenshot({path:path.join(out,`${width}-lesson.png`)});
  await page.locator('[data-learn="read-lesson"]').click();
 }
 assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('decide.tarot.learn.v1')).lessons).length),6);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('decide.tarot.logs.v1')||'[]').length),0);
 await page.locator('[data-tab="lessons"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.learn-tab[aria-selected="true"]').getAttribute('data-tab'),'articles');
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.learn-tab[aria-selected="true"]').getAttribute('data-tab'),'cards');
 console.log('PASS',width,'lazy articles, search, filter, reader + back, all six lessons, three-tab keyboard');await context.close();
}
const {context,page}=await open(390,844);await page.locator('[data-tab="articles"]').click();await page.locator('.learn-article-item').first().waitFor();
const audit=await page.evaluate(async content=>{
 let blocks=0;
 for(const article of content.articles){
  document.querySelector('[data-learn="article-filter"][data-category="all"]').click();
  const input=document.querySelector('#learn-article-search');input.value=article.title;input.dispatchEvent(new Event('input',{bubbles:true}));
  const entry=[...document.querySelectorAll('[data-learn="article"]')].find(el=>el.dataset.id===article.id);if(!entry)throw Error(`missing article ${article.id}`);entry.click();
  const body=[...document.querySelector('.learn-article-body').children];
  if(body.length!==article.blocks.length)throw Error(`wrong blocks ${article.id}`);
  body.forEach((el,i)=>{if(el.textContent!==(article.blocks[i].type==='li'?'・':'')+article.blocks[i].text)throw Error(`wrong text ${article.id} ${i}`);blocks++;});
  document.querySelector('[data-learn="article-list"]').click();
 }
 return {articles:content.articles.length,blocks};
},content);console.log('PASS all imported bodies',JSON.stringify(audit));await context.close();
const retry=await open(390,844);await retry.page.route('**/assets/related-articles.json',route=>route.fulfill({status:503,body:'unavailable'}));
await retry.page.locator('[data-tab="articles"]').click();await retry.page.locator('[data-learn="article-retry"]').waitFor();await retry.page.unroute('**/assets/related-articles.json');await retry.page.locator('[data-learn="article-retry"]').click();await retry.page.locator('.learn-article-item').first().waitFor();console.log('PASS article retry');await retry.context.close();
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-audit.json'),JSON.stringify({audit,widths:[320,390,430],lessons:6,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const articles=JSON.parse(await read('dist/assets/related-articles.json'));
const learn=JSON.parse(await read('dist/assets/learn.json'));
const source=await read('dist/learn.js');
test('all imported WXR drafts have unique identities and text-only reading blocks',()=>{
 assert.equal(articles.articles.length,126);
 assert.equal(new Set(articles.articles.map(a=>a.id)).size,126);
 const categories=new Set(articles.categories.map(c=>c.id));
 const tags=new Set(['p','h2','h3','li','blockquote']);
 for(const article of articles.articles){
  assert.match(article.id,/^[a-z0-9-]+$/);
  assert.ok(article.title && article.summary && article.minutes>=1);
  assert.ok(categories.has(article.category));assert.ok(article.blocks.length>2);
  for(const block of article.blocks){assert.ok(tags.has(block.type));assert.equal(typeof block.text,'string');assert.ok(block.text.trim());}
  assert.equal(article.blocks.filter(b=>b.type==='h2').length,2);
  assert.equal(Object.hasOwn(article,'url'),false,'source WXR links are not treated as published article URLs');
 }
});
test('reading renders imported text without raw source HTML and keeps article fetching separate',()=>{
 assert.match(source,/fetch\('\.\/assets\/related-articles\.json'\)/);
 assert.match(source,/\['articles','関連記事'\]/);
 assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML/);
 assert.match(source,/if\(articleId\)\{showArticleList\(\);return;\}/);
 assert.match(source,/articleListScroll/);
});
test('six rewritten lessons preserve progress IDs and explain technical terms with examples',()=>{
 assert.deepEqual(learn.lessons.map(l=>l.id),['l1','l2','l3','l4','l5','l6']);
 for(const lesson of learn.lessons){
  assert.ok(lesson.body.length>=3);
  for(const paragraph of lesson.body)assert.ok(paragraph.length<=180,`${lesson.id}: paragraph too long`);
  assert.ok(lesson.quiz.choices[lesson.quiz.answer]);
 }
 assert.ok(learn.lessons[0].body.join('').includes('覚えなくても大丈夫'));
 assert.ok(learn.lessons[4].body.join('').includes('上下が逆さま'));
 assert.ok(learn.lessons[5].body.join('').includes('「見送る」は今回はやめる'));
});

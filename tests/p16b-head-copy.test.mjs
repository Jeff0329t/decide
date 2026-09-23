import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const image=fs.readFileSync(new URL('../dist/og-image-v2.png',import.meta.url));
const oldImage=fs.readFileSync(new URL('../dist/og-image.png',import.meta.url));
const heading='DECIDE — 心から納得いく決断を。';
const legacy=['別の','角度'].join('');

test('document and social metadata use the unified heading and v2 image',()=>{
  assert.match(html,new RegExp(`<title>${heading}</title>`));
  assert.match(html,new RegExp(`property="og:title" content="${heading}"`));
  assert.match(html,new RegExp(`name="twitter:title" content="${heading}"`));
  assert.match(html,/property="og:image" content="https:\/\/decide-tarot-6aafab\.muddy-crane-3536\.chatgpt\.site\/og-image-v2\.png"/);
  assert.match(html,/name="twitter:image" content="https:\/\/decide-tarot-6aafab\.muddy-crane-3536\.chatgpt\.site\/og-image-v2\.png"/);
  assert.ok(!html.includes(legacy));
});

test('app sharing uses the same heading for title and text',()=>{
  const appShare=app.slice(app.indexOf("return {title:'DECIDE — 心から納得いく決断を。'"),app.indexOf('function openShare'));
  assert.match(appShare,/title:'DECIDE — 心から納得いく決断を。'/);
  assert.match(appShare,/text:'DECIDE — 心から納得いく決断を。'/);
  assert.ok(!appShare.includes(legacy));
});

test('new PNG is intact at 1200 by 630 and the previous image remains',()=>{
  assert.equal(image.subarray(1,4).toString(),'PNG');
  assert.equal(image.readUInt32BE(16),1200);
  assert.equal(image.readUInt32BE(20),630);
  assert.ok(image.length>0);
  assert.ok(oldImage.length>0);
});

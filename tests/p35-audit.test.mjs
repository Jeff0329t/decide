import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL(`../dist/${path}`,import.meta.url),'utf8');
const app=read('app.js');
const sw=read('service-worker.js');
const learn=read('learn.js');

test('learn data is precached so the learn screen works offline',()=>{
  assert.match(sw,/'\.\/assets\/learn\.json'/);
  assert.match(sw,/\/\\\/assets\\\/rider-waite\\\//);
  assert.doesNotMatch(sw,/\/\^\\\/assets\\\/rider-waite/);
});

test('log ids are always escaped in HTML attributes',()=>{
  assert.doesNotMatch(app,/data-(?:swipe-)?id="\$\{(?!esc\()/);
});

test('stored logs load leniently while imports stay strict',()=>{
  assert.match(app,/let logs = \(list=>Array\.isArray\(list\)/);
  const source=app.match(/function isImportCard[\s\S]*?\n(?=function reviewedAtTime)/)?.[0];
  const isImportLog=Function(`${source}; return isImportLog;`)();
  const card={id:'m00',name:'愚者',orientation:'upright'};
  assert.equal(isImportLog({id:'a',createdAt:'2026-09-01T00:00:00Z',nodes:[{card}]}),true);
  assert.equal(isImportLog({id:'a',createdAt:'invalid',nodes:[{card}]}),false);
  assert.equal(isImportLog({id:'a',createdAt:'2026-09-01T00:00:00Z',nodes:[{card:{...card,orientation:'x'}}]}),false);
});

test('invalid deck modes fall back to a known preset',()=>{
  assert.match(app,/DECK_MODES = \['major-upright','major-reversed','all-upright','all-reversed'\]/);
});

test('share and image failures are handled',()=>{
  assert.match(app,/if\(type!=='app' && !log\)\{toast\('記録が見つかりません'\);return;\}/);
  assert.doesNotMatch(app,/save-share-image|native-share|downloadShareImage/);
});

test('missing related lessons are skipped',()=>{
  assert.match(learn,/const lesson=data\.lessons\.find\(l=>l\.id===lid\);if\(!lesson\)continue;/);
});

test('service worker precache bypasses the HTTP cache',()=>{
  assert.match(sw,/cache\.addAll\(SHELL_FILES\.map\(path => new Request\(path, \{cache: 'reload'\}\)\)\)/);
});

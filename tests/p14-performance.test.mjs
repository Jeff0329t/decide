import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';

const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const worker=await readFile(new URL('../dist/service-worker.js',import.meta.url),'utf8');
const images=await readdir(new URL('../dist/assets/rider-waite/',import.meta.url));

test('all original cards have 320px and 480px WebP variants',()=>{
  const jpg=images.filter(name=>/^(?:ar|wa|cu|sw|pe)\d{2}\.jpg$/.test(name));
  assert.equal(jpg.length,78);
  for(const name of jpg)for(const width of [320,480])assert.ok(images.includes(name.replace('.jpg',`-${width}.webp`)),`${name}: ${width}px missing`);
});

test('card markup uses WebP source, JPG fallback and dimensions',()=>{
  assert.match(app,/<source type="image\/webp" srcset=/);
  assert.match(app,/cardImageHeight\(card\)/);
  assert.match(app,/<img data-card-image width="480" height="\$\{cardImageHeight\(card\)\}"/);
  assert.match(app,/src="\$\{src\}"/);
});

test('reveal begins image loading without waiting to show the result',()=>{
  assert.match(app,/preloadCardImages\(\[card\]\)/);
  assert.match(app,/preloadCardImages\(activeSession\.drawOptions\.slice\(0,2\)\)/);
  assert.doesNotMatch(app,/await preloadCardImages/);
  assert.doesNotMatch(app,/await \(activeSession\.imageReady/);
});

test('worker caches shell and up to 100 card images and activates right away',()=>{
  for(const file of ['index.html','app.js','styles.css','manifest.webmanifest','assets/cards.json'])assert.ok(worker.includes(file));
  assert.match(worker,/const IMAGE_LIMIT = 100/);
  assert.match(worker,/request\.mode === 'navigate'/);
  assert.match(worker,/caches\.match\(new URL\('\.\/', SCOPE\)\.href\)/);
  assert.match(worker,/cacheCardImage\(request, event\)/);
  // iOS で旧版が待機したまま残らないよう、取得後すぐ切り替える。案内バーからのメッセージも受け付ける
  assert.equal(worker.match(/skipWaiting\(/g)?.length,2);
  assert.match(worker,/\.then\(\(\) => self\.skipWaiting\(\)\)/);
  assert.match(worker,/event\.data\?\.type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
  assert.doesNotMatch(worker,/localStorage/);
});

test('page reloads once when an updated worker takes control',()=>{
  assert.match(app,/const hadController = !!navigator\.serviceWorker\.controller/);
  assert.match(app,/addEventListener\('controllerchange'/);
  assert.match(app,/if \(!hadController \|\| reloadedForUpdate\) return;/);
  // 利用者が「更新する」を押したときだけ再読み込みし、それ以外は案内バーを出す
  assert.match(app,/if \(!updateRequested\) \{ showUpdateBar\(null\); return; \}/);
});

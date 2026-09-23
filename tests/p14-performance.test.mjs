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

test('worker caches shell and up to 100 card images without skipWaiting',()=>{
  for(const file of ['index.html','app.js','styles.css','manifest.webmanifest','assets/cards.json'])assert.ok(worker.includes(file));
  assert.match(worker,/const IMAGE_LIMIT = 100/);
  assert.match(worker,/request\.mode === 'navigate'/);
  assert.match(worker,/caches\.match\(new URL\('\.\/', SCOPE\)\.href\)/);
  assert.match(worker,/cacheCardImage\(request, event\)/);
  assert.doesNotMatch(worker,/skipWaiting\(/);
  assert.doesNotMatch(worker,/localStorage/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/styles.css',import.meta.url),'utf8');

test('mobile sheets reserve iPhone top and bottom safe areas',()=>{
  assert.match(css,/@media \(max-width: 679px\)[\s\S]*max-height: calc\(100dvh - max\(env\(safe-area-inset-top\), 48px\) - 8px\)/);
  assert.match(css,/padding-bottom: calc\(24px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/\.modal-shade \{ position: absolute; inset: 0;/);
});

test('mobile sheet header and close controls stay reachable',()=>{
  assert.match(css,/@media \(max-width: 679px\)[\s\S]*\.sheet-head \{ position: sticky;/);
  assert.match(css,/\.sheet-head button \{ width: 48px; height: 48px;/);
  assert.match(css,/\.card-detail-close \{ width: 100%; min-height: 52px;/);
  assert.equal((app.match(/class="button card-detail-close" data-action="close-card-detail">閉じる<\/button>/g)||[]).length,2);
});

test('card detail supports close icon, bottom button, backdrop and handle swipe',()=>{
  assert.match(app,/class="modal-shade" data-action="close-card-detail"/);
  assert.match(app,/data-action="close-card-detail" aria-label="閉じる">×<\/button>/);
  assert.match(app,/handle\.addEventListener\('pointerdown'/);
  assert.match(app,/handle\.addEventListener\('pointermove'/);
  assert.match(app,/sheet\.scrollTop>0/);
  assert.match(app,/if\(distance>=72\)closeModal/);
});

test('background scroll is fixed only while a modal is open',()=>{
  assert.match(css,/\.modal-open \{ overflow: hidden; overscroll-behavior: none; \}/);
  assert.match(css,/\.modal-open \.app-shell \{ position: fixed; left: 0; right: 0; width: 100%; \}/);
  assert.match(app,/setBodyScrollLocked\(true\)/);
  assert.match(app,/setBodyScrollLocked\(false\)/);
  assert.match(app,/window\.scrollTo\(0,modalScrollY\)/);
});

test('long and landscape layouts remain scrollable without full-screen clipping',()=>{
  assert.match(css,/\.settings-sheet \{[^}]*overflow-y: auto/);
  assert.match(css,/@media \(max-width: 679px\) and \(orientation: landscape\)/);
  assert.match(css,/overscroll-behavior: contain/);
  assert.match(css,/-webkit-overflow-scrolling: touch/);
});

test('dark mode and reduced-motion rules remain present',()=>{
  assert.match(css,/@media \(prefers-color-scheme: dark\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});

test('touched sheet user text is assigned via textContent',()=>{
  assert.match(app,/querySelector\('\[data-delete-title\]'\)\.textContent=log\.title/);
  assert.match(app,/if\(preview\)preview\.textContent=shareText/);
  assert.match(app,/querySelector\('\[data-share-copy-label\]'\)\.textContent=/);
});

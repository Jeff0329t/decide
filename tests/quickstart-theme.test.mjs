import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL(`../dist/${path}`,import.meta.url),'utf8');
const app=read('app.js');
const css=read('styles.css');
const sw=read('service-worker.js');

test('quickstart uses the editorial plates and a pick animation',()=>{
  assert.match(app,/class="quickstart-plate"/);
  assert.match(app,/class="choice-kicker"/);
  assert.match(app,/class="choice-vs"/);
  assert.match(app,/class="choice-stamp"/);
  assert.match(app,/action === 'start'\) pickDrawMode\(el, event\)/);
  assert.match(app,/function pickDrawMode\(button, event\)\{[\s\S]*?event\.detail===0 \|\| prefersReducedMotion\(\)/);
});

test('quickstart styles keep the card backs intact',()=>{
  assert.match(css,/\.quickstart-screen \.choice-stamp|span\.choice-stamp \{/);
  assert.match(css,/\.quickstart-screen\.is-choosing \.draw-choice:not\(\.is-picked\)/);
  const block=css.slice(css.indexOf('/* Quickstart: editorial mode selector'));
  assert.doesNotMatch(block,/\.card-back[^{]*\{[^}]*(background|border|box-shadow)/);
});

test('shell cache was bumped for the quickstart redesign',()=>{
  assert.match(sw,/decide-shell-editorial-v59/);
});

test('quickstart shows the app name as a brand header',()=>{
  const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.match(app,/<header class="quickstart-brand" aria-label="DECIDE\.">/);
  assert.match(app,/TAROT FOR DECISIONS/);
});

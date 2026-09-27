import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(new URL(`../dist/${path}`,import.meta.url),'utf8');
const app=read('app.js');
const css=read('styles.css');

test('two-card draw uses A/B plates, an OR emblem and a hold-to-reveal CTA',()=>{
  assert.match(app,/class="draw-label draw-plate"/);
  assert.match(app,/<span class="draw-vs" aria-hidden="true">OR<\/span>/);
  assert.match(app,/class="button reveal-both reveal-hold" data-action="flip-both"/);
  assert.match(app,/draw-screen\$\{two \? ' draw-two' : ''\}/);
});

test('reveal requires a hold, but keyboard and reduced motion open directly',()=>{
  assert.match(app,/REVEAL_HOLD_MS\s*=\s*900/);
  assert.match(app,/event\.detail===0 \|\| prefersReducedMotion\(\)\) flipBoth\(\)/);
  assert.match(app,/pointercancel/);
});

test('two-card editorial styles exist without touching the card faces',()=>{
  assert.match(css,/Two-card draw: editorial A\/B plates, VS emblem and hold-to-reveal CTA/);
  const section=css.slice(css.indexOf('Two-card draw: editorial A/B plates'));
  assert.doesNotMatch(section,/\.flip-(?:back|front)/);
  assert.doesNotMatch(section,/draw-collage/);
  assert.match(section,/\.reveal-hold\.charging \.reveal-charge/);
});

test('two-card instruction sits above OPTION A instead of over the reveal button',()=>{
  assert.match(app,/<span class="draw-vs" aria-hidden="true">OR<\/span>\s*<p class="draw-instruction">/);
  assert.match(app,/\$\{two \? '' : `<p class="draw-instruction">/);
  assert.match(css,/\.draw-screen\.draw-two \.dual-draw \.draw-instruction\s*\{[^}]*bottom:\s*calc\(100% \+ 14px\)/);
});

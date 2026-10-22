import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('dist/app.js');
const css = read('dist/styles.css');
const body = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} がある`);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

function harness() {
  const pending = [], proceeded = [], screenClasses = new Set();
  const instruction = { textContent: '開いています…' };
  const screen = { classList: { add: name => screenClasses.add(name) }, querySelector: () => instruction };
  const context = {
    activeSession: { id: 's1' }, currentView: 'draw', revealLinger: null, REVEAL_LINGER_MS: 1000,
    document: { querySelector: () => screen },
    sensoryFeedback: () => {},
    setTimeout: (callback, ms) => { pending.push({ callback, ms }); return pending.length; },
    clearTimeout: () => {}
  };
  vm.createContext(context); vm.runInContext(body(app, 'lingerOnReveal'), context);
  return { context, pending, proceeded, screenClasses, instruction, proceed: () => proceeded.push('next') };
}

test('an opened card holds its name on screen before moving on', async () => {
  const h = harness();
  h.context.lingerOnReveal('s1', Promise.resolve(), '「月」正位置', h.proceed);
  await Promise.resolve(); await Promise.resolve();
  assert.ok(h.screenClasses.has('is-lingering'));
  assert.equal(h.instruction.textContent, '「月」正位置');
  assert.equal(h.pending.length, 1); assert.equal(h.pending[0].ms, 1000);
  assert.equal(h.proceeded.length, 0);
  h.pending[0].callback();
  assert.deepEqual(h.proceeded, ['next']);
  assert.equal(h.context.revealLinger, null);
});

test('a tap during the hold moves on at once, and only once', async () => {
  const h = harness();
  h.context.lingerOnReveal('s1', Promise.resolve(), '名前', h.proceed);
  await Promise.resolve(); await Promise.resolve();
  h.context.revealLinger();
  h.pending[0].callback();
  assert.deepEqual(h.proceeded, ['next']);
});

test('leaving the draw screen during the hold does not pull the user back', async () => {
  const h = harness();
  h.context.lingerOnReveal('s1', Promise.resolve(), '名前', h.proceed);
  await Promise.resolve(); await Promise.resolve();
  h.context.currentView = 'history';
  h.pending[0].callback();
  assert.equal(h.proceeded.length, 0);
});

test('reveal timing: B opens a breath after A, and taps on the draw screen skip the hold (but not the back link)', () => {
  assert.match(css, /\.pair-card\[data-slot="1"\] \.flip-inner \{ transition-delay: \.4s; \}/);
  assert.match(app, /const REVEAL_PAIR_FLIP_MS=960;/);
  assert.match(app, /if\(revealLinger && event\.target\.closest\('\.draw-screen'\) && !event\.target\.closest\('\[data-action="home"\]'\)\)\{ revealLinger\(\); return; \}/);
  assert.match(css, /::view-transition-group\(reveal-card-0\)/);
});

test('two-card draw shows the wording the user typed under each plate', () => {
  const context = { activeSession: { mode: 'two' }, decisionDraft: { option1: '続ける', option2: '' }, esc: value => value };
  vm.createContext(context); vm.runInContext(body(app, 'optionPlateText'), context);
  assert.equal(context.optionPlateText(0), '<span class="option-plate-text">続ける</span>');
  assert.equal(context.optionPlateText(1), '<span class="option-plate-text"></span>', 'the empty side keeps the same height');
  context.decisionDraft.option1 = '';
  assert.equal(context.optionPlateText(0), '', 'nothing typed, nothing added');
  assert.match(body(app, 'drawCardButton'), /\$\{optionPlateText\(slot\)\}/);
});

test('completion: no duplicate toast, starts at the stamp, and picking a reminder does not replay the entrance', () => {
  const save = body(app, 'saveDecision');
  assert.doesNotMatch(save, /toast\('決定を記録しました'\)/);
  assert.match(save, /render\(\); scrollAppTo\(0\);/);
  const remind = body(app, 'setRemind');
  assert.match(remind, /picker\.outerHTML=renderRemindPicker\(log\)/);
  assert.match(css, /\.completion-dock > \.remind-picker \{ animation: completion-follow \.6s cubic-bezier\(\.2,\.8,\.2,1\) \.9s both; \}/);
  assert.match(css, /\.completion-dock > \.remind-picker\.is-settled \{ animation: none; \}/);
});

test('the card hand-off still moves on if the view transition never calls back', () => {
  const pending = [], moved = [];
  const context = {
    currentView: 'draw',
    document: {
      querySelectorAll: selector => selector.includes('flip-front') ? [{ style: {} }] : [],
      startViewTransition: () => ({ ready: { catch() {} } })
    },
    setTimeout: (callback, ms) => pending.push({ callback, ms })
  };
  vm.createContext(context); vm.runInContext(body(app, 'carryRevealedCards'), context);
  context.carryRevealedCards(() => moved.push('session'));
  assert.equal(moved.length, 0);
  assert.equal(pending[0].ms, 1500);
  pending[0].callback(); pending[0].callback();
  assert.deepEqual(moved, ['session']);
});

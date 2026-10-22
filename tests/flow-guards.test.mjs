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

function leaving(state) {
  const context = { tutorial: null, activeSession: null, currentView: 'home', ...state };
  vm.createContext(context); vm.runInContext(body(app, 'leavingDrawnSession'), context);
  return action => context.leavingDrawnSession(action);
}

test('leaving after cards are drawn asks first; before drawing, or going back from decide to the result, does not', () => {
  const drawn = { activeSession: { revealed: [0] } };
  for (const view of ['draw', 'session', 'decide']) {
    const ask = leaving({ ...drawn, currentView: view });
    assert.equal(ask('home'), true, `${view} → home`);
    assert.equal(ask('history'), true, `${view} → history`);
    assert.equal(ask('stats'), true, `${view} → stats`);
  }
  assert.equal(leaving({ ...drawn, currentView: 'session' })('nav-back'), true);
  assert.equal(leaving({ ...drawn, currentView: 'decide' })('nav-back'), false, 'decide → result keeps the session');
  assert.equal(leaving({ activeSession: { revealed: [] }, currentView: 'draw' })('home'), false, 'nothing drawn yet');
  assert.equal(leaving({ ...drawn, currentView: 'session', tutorial: { stage: 3 } })('home'), false, 'the tutorial handles its own exit');
  assert.equal(leaving({ ...drawn, currentView: 'session' })('card-detail'), false);
});

test('the leave sheet defaults to staying, and confirming replays the original destination', () => {
  const open = body(app, 'openLeaveConfirm');
  assert.match(open, /<button class="button secondary" data-action="confirm-leave">離れる<\/button><button class="button" data-action="close-leave">続ける<\/button>/);
  assert.match(open, /mountModal\(wrap,'\[data-action="close-leave"\]\.button'\)/);
  assert.match(app, /if \(!leaveConfirmed && leavingDrawnSession\(action\)\) \{ openLeaveConfirm\(el,action\); return; \}/);
  assert.match(app, /setBackgroundInert\(false\); setBodyScrollLocked\(false\);\n    if\(target\)\{ leaveConfirmed=true;/);
});

test('the options screen keeps "カードを引く" pinned above the nav', () => {
  assert.match(css, /\.thumb-prepare\[data-prepare-art="options"\] \.prepare-actions \{ position: sticky; bottom: calc\(76px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /html:not\(\.standalone-shell\) body\[data-view="prepare-options"\] \.app-shell \{ overflow: clip; \}/, 'the shell must not trap the sticky bar');
  assert.match(css, /\.prepare-screen\.thumb-prepare\[data-prepare-art="options"\] \{ overflow: visible; overflow-x: clip; \}/);
});

test('the splash wordmark hands off to the quickstart heading instead of peeling away', () => {
  const pending = [], transitions = [], classes = new Set();
  const wordmark = { style: { setProperty: (key, value) => { wordmark[key] = value; } } };
  const heading = { style: { setProperty: (key, value) => { heading[key] = value; } } };
  const splash = { classList: { contains: name => classes.has(name), add: name => classes.add(name) }, querySelector: () => wordmark };
  const context = {
    homeStage: 'splash', prefersReducedMotion: () => false,
    app: { querySelector: selector => selector === '.splash-screen' ? splash : heading, focus() {} },
    document: { startViewTransition: callback => { transitions.push(callback); } },
    renderHome: () => {}, softTransition: update => update(),
    setTimeout: (callback, ms) => pending.push({ callback, ms })
  };
  vm.createContext(context); vm.runInContext(body(app, 'startApp'), context);
  context.startApp(); context.startApp();
  assert.ok(classes.has('is-handoff'));
  assert.equal(wordmark['view-transition-name'], 'brand-mark');
  assert.equal(pending.length, 1, 'a second tap does not start it twice');
  pending[0].callback();
  assert.equal(context.homeStage, 'quickstart');
  assert.equal(heading['view-transition-name'], 'brand-mark');
  assert.match(css, /\.splash-screen\.peeling\.is-handoff \.home-wordmark \{ animation: none; \}/);
});

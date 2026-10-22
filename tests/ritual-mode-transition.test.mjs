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

function harness({ viewTransition = true } = {}) {
  const pending = [], started = [], bodyClasses = new Set(), screenClasses = new Set(), transitions = [];
  const button = { isConnected: true, dataset: { mode: 'one' }, style: {}, closest: () => ({ classList: { add: name => screenClasses.add(name) } }) };
  const document = {
    body: { classList: { add: name => bodyClasses.add(name), remove: name => bodyClasses.delete(name) } },
    ...(viewTransition ? { startViewTransition: callback => { transitions.push(callback); } } : {})
  };
  const context = { document, pickingDrawMode: true, startSession: mode => started.push(mode), setTimeout: (callback, ms) => pending.push({ callback, ms }) };
  vm.createContext(context); vm.runInContext(body(app, 'enterRitual'), context);
  return { context, button, pending, started, bodyClasses, screenClasses, transitions };
}

test('picking a draw mode waits for the stamp to settle, then carries the plate into the next screen', () => {
  const h = harness();
  h.context.enterRitual(h.button);
  assert.equal(h.pending.length, 1); assert.equal(h.pending[0].ms, 650);
  assert.equal(h.started.length, 0);
  h.pending.shift().callback();
  assert.equal(h.button.style.viewTransitionName, 'ritual-art');
  assert.equal(h.transitions.length, 1);
  h.transitions[0]();
  assert.deepEqual(h.started, ['one']);
  assert.ok(h.bodyClasses.has('ritual-enter'));
  assert.equal(h.context.pickingDrawMode, false);
  h.pending.shift().callback();
  assert.ok(!h.bodyClasses.has('ritual-enter'));
});

test('without view transitions the quickstart fades out before the next screen', () => {
  const h = harness({ viewTransition: false });
  h.context.enterRitual(h.button);
  h.pending.shift().callback();
  assert.ok(h.screenClasses.has('is-leaving'));
  assert.equal(h.pending[0].ms, 320); assert.equal(h.started.length, 0);
  h.pending.shift().callback();
  assert.deepEqual(h.started, ['one']);
});

test('leaving the quickstart before the transition cancels the session start', () => {
  const h = harness();
  h.context.enterRitual(h.button);
  h.button.isConnected = false;
  h.pending.shift().callback(); h.transitions[0]?.();
  assert.equal(h.started.length, 0);
  assert.equal(h.context.pickingDrawMode, false);
});

test('pickDrawMode hands off to the ritual and the next screen reveals in order', () => {
  assert.match(body(app, 'pickDrawMode'), /button\.classList\.add\('is-picked'\);\n  enterRitual\(button\);/);
  assert.doesNotMatch(app, /motionProto|motion-proto/);
  assert.match(css, /body\.ritual-enter \.thumb-prepare \.prepare-art \{ view-transition-name: ritual-art; \}/);
  assert.match(css, /body\.ritual-enter \.thumb-prepare \.prepare-heading \{ animation: ritual-rise [^}]*\.5s both; \}/);
  assert.match(css, /body\.ritual-enter \.thumb-prepare \.prepare-controls \{ animation: ritual-rise [^}]*\.8s both; \}/);
});

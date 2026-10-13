import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const setupSource=source.slice(source.indexOf('function installViewportNavigation()'),source.indexOf('const STORAGE_KEY'));
function setup({supported=true}={}) {
  const handlers={viewport:{},window:{},document:{}};
  const target=name=>({addEventListener:(event,fn)=>{handlers[name][event]=fn;}});
  const viewport={...target('viewport'),height:844,offsetTop:0,scale:1};
  const frames=new Map(),timers=new Map();let serial=0,offset;
  const context={window:{...target('window'),visualViewport:supported?viewport:null},document:{...target('document'),activeElement:{matches:()=>true},documentElement:{clientHeight:844,style:{setProperty:(key,value)=>{offset=value;}}}},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(setupSource,context);
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  flush();
  return {viewport,handlers,flush,blur:()=>{context.document.activeElement=null;handlers.document.focusout();},offset:()=>offset,settle:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());flush();}};
}
test('dock follows keyboard resize and viewport panning while editing',()=>{
  const env=setup();assert.equal(env.offset(),'0px');
  env.viewport.height=500;env.handlers.viewport.resize();env.flush();assert.equal(env.offset(),'344px');
  env.viewport.offsetTop=120;env.handlers.viewport.scroll();env.flush();assert.equal(env.offset(),'224px');
  env.viewport.height=844;env.viewport.offsetTop=0;env.handlers.viewport.resize();env.flush();assert.equal(env.offset(),'0px');
});
test('focusout rechecks after keyboard dismissal even without a final resize event',()=>{
  const env=setup();env.viewport.height=500;env.handlers.viewport.resize();env.flush();
  env.handlers.document.focusout();env.flush();assert.equal(env.offset(),'344px');
  env.viewport.height=844;env.settle();assert.equal(env.offset(),'0px');
});
test('closed keyboard ignores residual safe-area height and panning while the textarea stays focused',()=>{
  const env=setup();env.viewport.height=500;env.handlers.viewport.resize();env.flush();assert.equal(env.offset(),'344px');
  for(const gap of [34,60,100]){
    env.viewport.height=844-gap;env.viewport.offsetTop=12;
    env.handlers.viewport.resize();env.flush();assert.equal(env.offset(),'0px');
    env.handlers.viewport.scroll();env.flush();assert.equal(env.offset(),'0px');
  }
});
test('leaving the input clears the keyboard inset even if viewport measurements remain stale',()=>{
  const env=setup();env.viewport.height=500;env.handlers.viewport.resize();env.flush();assert.equal(env.offset(),'344px');
  env.blur();env.flush();assert.equal(env.offset(),'0px');
  env.settle();assert.equal(env.offset(),'0px');
});
test('residual viewport pan and zoom do not create a bottom gap',()=>{
  const env=setup();env.viewport.offsetTop=34;env.handlers.viewport.scroll();env.flush();assert.equal(env.offset(),'0px');
  env.viewport.height=500;
  env.viewport.scale=2;env.handlers.viewport.resize();env.flush();assert.equal(env.offset(),'0px');
});
test('browsers without VisualViewport keep the CSS fixed-position fallback',()=>{
  const env=setup({supported:false});assert.equal(env.offset(),undefined);
});

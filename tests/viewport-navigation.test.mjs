import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const setupSource=source.slice(source.indexOf('function installViewportNavigation()'),source.indexOf('const STORAGE_KEY'));
function setup({standalone=true,supported=true}={}){
  const handlers={viewport:{},window:{},document:{}};
  const target=name=>({addEventListener:(event,fn)=>{handlers[name][event]=fn;}});
  const viewport={...target('viewport'),height:844,offsetTop:0,scale:1};
  const values={},classes=new Set(),children=[],scrollCalls=[];
  const frame={style:{setProperty:(key,value)=>{values[key]=value;}},append:(...items)=>children.push(...items)};
  const shell={scrollTop:235,scrollTo:({top})=>{shell.scrollTop=top;}},nav={},body={insertBefore:()=>{}};
  const frames=new Map(),timers=new Map();let serial=0;
  const document={...target('document'),body,activeElement:{matches:()=>true},createElement:()=>frame,querySelector:sel=>({'.app-shell':shell,'.bottom-nav':nav,'.app-viewport':classes.has('standalone-shell')?frame:null}[sel]||null),documentElement:{clientHeight:844,classList:{add:k=>classes.add(k),contains:k=>classes.has(k)}}};
  const context={document,window:{...target('window'),navigator:{},matchMedia:()=>({matches:standalone}),visualViewport:supported?viewport:null,scrollY:0,scrollTo:args=>scrollCalls.push(args)},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(context);vm.runInContext(setupSource,context);
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};flush();
  return {viewport,handlers,values,classes,children,shell,nav,scrollCalls,context,flush,blur:()=>{document.activeElement=null;handlers.document.focusout();},settle:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());flush();}};
}
test('standalone dock leaves the scrolling shell and follows the visible keyboard viewport',()=>{
  const e=setup();assert.deepEqual(e.children,[e.shell,e.nav]);
  e.viewport.height=500;e.viewport.offsetTop=120;e.handlers.viewport.resize();e.flush();
  assert.equal(e.values['--app-viewport-height'],'500px');assert.equal(e.values['--app-viewport-top'],'120px');
});
test('keyboard dismissal restores the full frame and resets native root without losing content position',()=>{
  const e=setup();e.viewport.height=500;e.handlers.viewport.resize();e.flush();const before=e.scrollCalls.length;
  e.viewport.height=810;e.viewport.offsetTop=12;e.handlers.viewport.resize();e.flush();
  assert.equal(e.values['--app-viewport-height'],'844px');assert.equal(e.values['--app-viewport-top'],'0px');
  assert.equal(e.scrollCalls.length,before+1);assert.equal(e.shell.scrollTop,235);
  assert.equal(e.scrollCalls.at(-1).top,0);
});
test('any input blur repairs native drift even when viewport height and root scrollY are stale',()=>{
  const e=setup();e.viewport.height=500;e.handlers.viewport.resize();e.flush();const before=e.scrollCalls.length;
  e.blur();e.flush();e.settle();assert.ok(e.scrollCalls.length>before);
  assert.equal(e.values['--app-viewport-height'],'844px');assert.equal(e.shell.scrollTop,235);
});
test('navigation scrolls the content while root repairs preserve it',()=>{
  const e=setup();vm.runInContext('scrollAppTo(640)',e.context);assert.equal(e.shell.scrollTop,640);
  e.handlers.window.pageshow();e.flush();assert.equal(e.shell.scrollTop,640);
  assert.equal(vm.runInContext('appScrollTop()',e.context),640);
});
test('standalone without VisualViewport still separates content and dock',()=>{
  const e=setup({supported:false});assert.deepEqual(e.children,[e.shell,e.nav]);assert.equal(e.values['--app-viewport-height'],'844px');
});
test('normal browser pages retain native document scrolling',()=>{
  const e=setup({standalone:false});assert.equal(e.children.length,0);assert.equal(e.scrollCalls.length,0);
  vm.runInContext('scrollAppTo(200)',e.context);assert.equal(e.scrollCalls.at(-1).top,200);
});

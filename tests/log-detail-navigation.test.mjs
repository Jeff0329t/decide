import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const navigation=['navigateBack','navigate'].map(name=>source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n');

test('returning from completion and reopening the pending log shows review details',()=>{
  const context=vm.createContext({tutorial:null,currentView:'detail',detailReturn:'history',completionId:'new-log',detailId:'new-log',requestAnimationFrame:()=>{},render:()=>{}});
  vm.runInContext(navigation,context);
  vm.runInContext('navigateBack(); navigate("detail","new-log");',context);
  assert.equal(context.currentView,'detail');
  assert.equal(context.detailId,'new-log');
  assert.notEqual(context.completionId,context.detailId,'reopening must not render the completion reminder');
});

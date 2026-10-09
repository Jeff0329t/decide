import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const storyBranch = appSource.slice(appSource.indexOf("if (type === 'story' && log) {"), appSource.indexOf("return {title:'DECIDE — 心から納得いく決断を。'"));

test('A-1: story share URL omits title/body unless opted in', () => {
  assert.match(appSource, /function sharedResultUrl\(log,type,\{includeContent=false\}=\{\}\)/);
  assert.match(appSource, /if\(type==='story'&&includeContent\)\{ payload\.t=log\.title;/);
});

test('A-1: story share defaults to excluding title and body', () => {
  assert.match(appSource, /function shareData\(type='app', log=null, \{includeContent=false\}=\{\}\)/);
  const excluded = storyBranch.slice(storyBranch.lastIndexOf("return {...base"));
  assert.match(excluded, /logTitle:'決定の記録'/);
  assert.match(excluded, /タイトルと本文は共有されません/);
  assert.doesNotMatch(excluded, /log\.title|log\.story|story\b(?!',)/);
  assert.match(excluded, /url:sharedResultUrl\(log,type\)/);
});

test('A-1: opting in warns that title and body are shown', () => {
  const included = storyBranch.slice(storyBranch.indexOf('if(includeContent)'), storyBranch.lastIndexOf("return {...base"));
  assert.match(included, /タイトルと本文が共有先に表示されます/);
  assert.match(included, /sharedResultUrl\(log,type,\{includeContent:true\}\)/);
});

test('A-1: story share modal has an OFF-by-default opt-in toggle wired up', () => {
  assert.match(appSource, /data-action="toggle-share-content" aria-pressed="false"><span><\/span><b>OFF<\/b>/);
  assert.match(appSource, /action === 'toggle-share-content'\) toggleShareContent\(el\)/);
  assert.match(appSource, /function toggleShareContent\(button\)/);
  for (const attr of ['data-share-lead', 'data-share-x', 'data-share-line', 'data-share-facebook']) assert.ok(appSource.includes(attr), attr);
});

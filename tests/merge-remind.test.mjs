import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// 通知予定（remindAt・remindDays）は remindUpdatedAt で選ぶ。新しい解除・延期を古いログが戻さない（改善再確認 2026-10-12 項目4）
const sharedSource=fs.readFileSync(new URL('../dist/shared.js',import.meta.url),'utf8');
const context={atob,btoa,escape,decodeURIComponent,globalThis:null};
context.globalThis=context;
vm.runInNewContext(sharedSource,context);
const mergeLog=context.DECIDE_MERGE_LOG;
const plain=value=>JSON.parse(JSON.stringify(value));
const remindOf=log=>plain({remindAt:log.remindAt??'(none)',remindDays:log.remindDays??'(none)',remindUpdatedAt:log.remindUpdatedAt??'(none)'});
const both=(a,b)=>{
  const ab=mergeLog(a,b).log; const ba=mergeLog(b,a).log;
  assert.deepEqual(remindOf(ab),remindOf(ba),'引数の順番で通知予定が変わらない');
  return ab;
};

test('新しい解除（null）が古い予定に勝ち、null のまま残る', () => {
  const newer={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z',remindAt:null,remindDays:null,remindUpdatedAt:'2026-10-12T00:00:00.000Z'};
  const older={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-10T00:00:00.000Z',remindAt:'2026-10-15T00:00:00.000Z',remindDays:3,remindUpdatedAt:'2026-10-10T00:00:00.000Z'};
  const log=both(newer,older);
  assert.equal(log.remindAt,null); assert.equal(log.remindDays,null);
  assert.equal(log.remindUpdatedAt,'2026-10-12T00:00:00.000Z');
});

test('新しい延期が古い予定に勝つ（remindDays もまとめて新しい側）', () => {
  const newer={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z',remindAt:'2026-10-15T09:00:00.000Z',remindDays:3,remindUpdatedAt:'2026-10-12T09:00:00.000Z'};
  const older={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-11T00:00:00.000Z',remindAt:'2026-10-12T00:00:00.000Z',remindDays:7,remindUpdatedAt:'2026-10-05T00:00:00.000Z'};
  const log=both(newer,older);
  assert.equal(log.remindAt,'2026-10-15T09:00:00.000Z'); assert.equal(log.remindDays,3);
});

test('ほかの項目が新しくても、通知予定は remindUpdatedAt で選ぶ', () => {
  const storyNewer={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-13T00:00:00.000Z',story:'つづき',storyUpdatedAt:'2026-10-13T00:00:00.000Z',remindAt:'2026-10-15T00:00:00.000Z',remindDays:3,remindUpdatedAt:'2026-10-10T00:00:00.000Z'};
  const clearedLater={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z',remindAt:null,remindDays:null,remindUpdatedAt:'2026-10-12T00:00:00.000Z'};
  const log=both(storyNewer,clearedLater);
  assert.equal(log.remindAt,null); assert.equal(log.remindDays,null);
  assert.equal(log.story,'つづき');
});

test('古い解除は新しい予定に負ける', () => {
  const olderClear={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-10T00:00:00.000Z',remindAt:null,remindDays:null,remindUpdatedAt:'2026-10-10T00:00:00.000Z'};
  const newerValue={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z',remindAt:'2026-10-19T00:00:00.000Z',remindDays:7,remindUpdatedAt:'2026-10-12T00:00:00.000Z'};
  const log=both(olderClear,newerValue);
  assert.equal(log.remindAt,'2026-10-19T00:00:00.000Z'); assert.equal(log.remindDays,7);
});

test('remindUpdatedAt のない古いログは updatedAt で比べる', () => {
  const newerClear={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z',remindAt:null,remindDays:null};
  const olderValue={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-10T00:00:00.000Z',remindAt:'2026-10-15T00:00:00.000Z'};
  const log=both(newerClear,olderValue);
  assert.equal(log.remindAt,null); assert.equal(log.remindDays,null);
  assert.equal('remindUpdatedAt' in log,false);

  const olderClear={...newerClear,updatedAt:'2026-10-09T00:00:00.000Z'};
  assert.equal(both(olderClear,olderValue).remindAt,'2026-10-15T00:00:00.000Z');
});

test('片方だけが remindUpdatedAt を持つときも日時どうしで比べる', () => {
  const legacyNewer={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z',remindAt:'2026-10-20T00:00:00.000Z'};
  const stampedOlder={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-11T00:00:00.000Z',remindAt:null,remindDays:null,remindUpdatedAt:'2026-10-11T00:00:00.000Z'};
  const log=both(legacyNewer,stampedOlder);
  assert.equal(log.remindAt,'2026-10-20T00:00:00.000Z');
  assert.equal('remindDays' in log,false); assert.equal('remindUpdatedAt' in log,false);
});

test('予定の項目がない側が新しくても、相手側の予定を消さない', () => {
  const noRemind={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z'};
  const withRemind={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-10T00:00:00.000Z',remindAt:'2026-10-15T00:00:00.000Z',remindDays:3,remindUpdatedAt:'2026-10-10T00:00:00.000Z'};
  const log=both(noRemind,withRemind);
  assert.equal(log.remindAt,'2026-10-15T00:00:00.000Z'); assert.equal(log.remindDays,3);
});

test('同じ内容なら changed にならない', () => {
  const log={id:'x',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-12T00:00:00.000Z',remindAt:null,remindDays:null,remindUpdatedAt:'2026-10-12T00:00:00.000Z'};
  const result=mergeLog(log,{...log});
  assert.equal(result.changed,false); assert.equal(result.conflict,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');

test('SNSシェア：Instagram → X → LINE → Facebook の順に縦に並ぶ', () => {
  const insta = app.indexOf('data-action="share-instagram-story"');
  const x = app.indexOf('x.com/intent/post');
  const line = app.indexOf('line.me/R/msg/text');
  const fb = app.indexOf('facebook.com/sharer');
  assert.ok(insta >= 0 && x >= 0 && line >= 0 && fb >= 0);
  assert.ok(insta < x && x < line && line < fb);
  assert.match(app, /async function createStoryImageBlob/);
  assert.match(app, /decisionprocess\.net/);
  assert.match(app, /SNSでシェア ↗/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');

test('SNSシェア：ストーリーズ画像とXポストがある', () => {
  assert.match(app, /share-instagram-story/);
  assert.match(app, /async function createStoryImageBlob/);
  assert.match(app, /W=1080, H=1920/);
  assert.match(app, /decisionprocess\.net/);
  assert.match(app, /Xにポスト/);
  assert.match(app, /x\.com\/intent\/post/);
  assert.match(app, /SNSでシェア ↗/);
});

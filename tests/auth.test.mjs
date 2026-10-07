import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const distFiles = () => fs.readdirSync(new URL('../dist/', import.meta.url), { recursive: true })
  .filter(name => /\.(js|html|json|webmanifest)$/.test(name));

test('フロントにシークレットを置かない', () => {
  for(const name of distFiles()) {
    // 「書かないこと」という注意コメントは除外し、コード部分だけを検査する
    const source = read(name).replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(source, /service_role/i, name);
    assert.doesNotMatch(source, /sk_(live|test)_/, name);
    assert.doesNotMatch(source, /whsec_/, name);
  }
});

test('index.html は supabase → config → auth → app の順で読み込む', () => {
  const html = read('index.html');
  const order = ['supabase-js@2', './config.js', './auth.js', './app.js'].map(src => html.indexOf(src));
  assert.ok(order.every(i => i >= 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('Service Worker が config.js と auth.js をキャッシュする', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /'\.\/config\.js'/);
  assert.match(sw, /'\.\/auth\.js'/);
});

test('app.js への変更はフックのみ', () => {
  const app = read('app.js');
  assert.match(app, /window\.DECIDE_AUTH\?\.maybePromptAfterSave\?\.\(/);
  assert.match(app, /window\.DECIDE_AUTH\?\.renderSettings\?\.\(wrap\)/);
  assert.match(app, /data-account-setting[^>]*hidden/);
});

test('ログイン案内とアカウント削除の文言', () => {
  const auth = read('auth.js');
  assert.match(auth, /Googleでログインして記録を引き継ぐ/);
  assert.match(auth, /PROMPT_AT_SAVE = 5/);
  assert.match(auth, /この端末に保存された決定ログは削除されません/);
  assert.match(auth, /functions\/v1\/delete-account/);
});

test('config.js は URL と anon キーだけ', () => {
  const config = read('config.js');
  assert.match(config, /SUPABASE_URL/);
  assert.match(config, /SUPABASE_ANON_KEY/);
});

test('プライバシーポリシーがログインと Supabase に触れている', () => {
  const privacy = read('privacy.html');
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /Google/);
  assert.match(privacy, /アカウントの削除/);
  assert.match(privacy, /Cloudflare Pages/);
  assert.doesNotMatch(privacy, /GitHub Pages/);
});

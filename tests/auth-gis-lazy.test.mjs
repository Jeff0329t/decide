// Googleのログイン用スクリプト（GIS）は、ログインボタンを押すまで読み込まないことを確認する
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

const AUTH_SRC = readFileSync(new URL('../dist/auth.js', import.meta.url), 'utf8');
const GIS = 'https://accounts.google.com/gsi/client';
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function makeElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(), dataset: {}, attributes: {}, hidden: false, disabled: false, innerHTML: '', textContent: '',
    setAttribute(k, v) { this.attributes[k] = String(v); },
    removeAttribute(k) { delete this.attributes[k]; },
    querySelector() { return null; },
    closest(sel) { return sel === '[data-auth-action]' && this.dataset.authAction ? this : null; },
    remove() { el.removed = true; },
    ...attrs
  };
  return el;
}

function setup({ clientId = 'test-client.apps.googleusercontent.com' } = {}) {
  const scripts = [];
  const clicks = [];
  const calls = { oauth: [], idToken: [] };
  const section = makeElement('section');
  const settings = makeElement('div', { id: 'settings-modal', querySelector: sel => sel === '[data-account-setting]' ? section : null });
  const document = {
    head: { appendChild(el) { scripts.push(el); return el; } },
    createElement: tag => makeElement(tag),
    querySelector(sel) {
      if(sel === '#settings-modal') return settings;
      const m = sel.match(/^script\[src="(.+)"\]$/);
      if(m) return scripts.find(s => s.src === m[1] && !s.removed) || null;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener(type, fn) { if(type === 'click') clicks.push(fn); }
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange() {},
      signInWithOAuth: async args => { calls.oauth.push(args); return { error: null }; },
      signInWithIdToken: async args => { calls.idToken.push(args); return { error: null }; }
    }
  };
  const window = {
    DECIDE_CONFIG: { SUPABASE_URL: 'http://localhost:54321', SUPABASE_ANON_KEY: 'anon', GOOGLE_CLIENT_ID: clientId },
    supabase: { createClient: () => client },
    crypto: webcrypto
  };
  const context = {
    window, document, crypto: webcrypto, TextEncoder, Uint8Array, setTimeout, clearTimeout, Promise, Date, Array, String, Boolean, Object, Set,
    location: { origin: 'http://localhost:8000', pathname: '/' }
  };
  vm.createContext(context);
  vm.runInContext(AUTH_SRC, context);
  const auth = window.DECIDE_AUTH;
  const gisScripts = () => scripts.filter(s => String(s.src).includes('accounts.google.com/gsi/client'));
  const click = async action => {
    const button = makeElement('button');
    button.dataset.authAction = action;
    const pending = Promise.all(clicks.map(fn => fn({ target: button })));
    return { button, pending };
  };
  return { auth, window, section, settings, scripts, gisScripts, click, calls };
}

test('未ログインで設定を描画しても GIS を読み込まず、自前の「Google でログイン」ボタンを出す', async () => {
  const env = setup();
  await env.auth.ready();
  env.auth.renderSettings(env.settings);
  await tick(150);
  assert.equal(env.gisScripts().length, 0, '設定表示だけで GIS を読み込んではいけない');
  assert.equal(env.scripts.length, 0);
  const html = env.section.innerHTML;
  assert.match(html, /<button class="button google-login" type="button" data-auth-action="login">/);
  assert.match(html, /Google でログイン/);
  assert.match(html, /<svg[^>]*focusable="false"/, 'ロゴはインラインSVG');
  assert.doesNotMatch(html, /https?:\/\//, 'ボタンが外部リソースを参照しない');
  assert.doesNotMatch(html, /data-google-button/);
});

test('renderGoogleButton（UNLIMITED案内から呼ばれる）も GIS を読み込まない', async () => {
  const env = setup();
  const container = makeElement('div');
  assert.equal(await env.auth.renderGoogleButton(container), false);
  await tick(150);
  assert.equal(container.hidden, true);
  assert.equal(env.gisScripts().length, 0);
});

test('ボタンを押すと GIS を読み込み、One Tap を表示して nonce 付き IDトークンでログインする', async () => {
  const env = setup();
  const { pending } = await env.click('login');
  await tick(0);
  assert.equal(env.gisScripts().length, 1, 'クリックで GIS を読み込む');
  assert.equal(env.gisScripts()[0].src, GIS);
  let initArgs = null;
  let prompted = 0;
  env.window.google = { accounts: { id: {
    initialize(args) { initArgs = args; },
    prompt(cb) { prompted++; cb({ isNotDisplayed: () => false, isSkippedMoment: () => false, isDismissedMoment: () => false, isDisplayed: () => true }); }
  } } };
  await pending;
  assert.equal(prompted, 1);
  assert.equal(initArgs.client_id, 'test-client.apps.googleusercontent.com');
  assert.equal(env.calls.oauth.length, 0, 'One Tap を出せたらリダイレクトしない');
  await initArgs.callback({ credential: 'id-token' });
  assert.equal(env.calls.idToken.length, 1);
  const { nonce, token, provider } = env.calls.idToken[0];
  assert.equal(provider, 'google');
  assert.equal(token, 'id-token');
  assert.equal(createHash('sha256').update(nonce).digest('hex'), initArgs.nonce, 'Googleにはハッシュ、Supabaseには生のnonce');
});

test('One Tap を表示できないときはリダイレクト方式でログインを続ける', async () => {
  const env = setup();
  env.window.google = { accounts: { id: {
    initialize() {},
    prompt(cb) { cb({ isNotDisplayed: () => true, getNotDisplayedReason: () => 'opt_out_or_no_session' }); }
  } } };
  const { pending } = await env.click('login');
  await pending;
  assert.equal(env.calls.oauth.length, 1);
  assert.equal(env.calls.oauth[0].provider, 'google');
});

test('利用者が One Tap を閉じた場合はリダイレクトしない', async () => {
  const env = setup();
  env.window.google = { accounts: { id: {
    initialize() {},
    prompt(cb) { cb({ isNotDisplayed: () => false, isSkippedMoment: () => true, getSkippedReason: () => 'user_cancel' }); }
  } } };
  const { pending } = await env.click('login');
  await pending;
  assert.equal(env.calls.oauth.length, 0);
});

test('GIS の読み込みに失敗したらリダイレクト方式へフォールバックする', async () => {
  const env = setup();
  const { pending } = await env.click('login');
  await tick(0);
  const script = env.gisScripts()[0];
  assert.ok(script);
  script.onerror();
  await pending;
  assert.equal(script.removed, true, '失敗したタグは外して再試行できるようにする');
  assert.equal(env.calls.oauth.length, 1);
});

test('GOOGLE_CLIENT_ID 未設定なら GIS を読まずにリダイレクトする', async () => {
  const env = setup({ clientId: '' });
  const { pending } = await env.click('login');
  await pending;
  assert.equal(env.gisScripts().length, 0);
  assert.equal(env.calls.oauth.length, 1);
});

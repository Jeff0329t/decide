#!/usr/bin/env node
// SNS シェア用 OGP 画像（1200x630 PNG）を生成する。
// 入力: dist/assets/cards.json + scripts/data/worries.json + dist/assets/rider-waite/*.jpg
// 出力: dist/assets/og/{id}.png（78枚）, dist/assets/og/worry-{slug}.png
// 仕組み: 一時HTMLを書き出し、ローカルの Google Chrome（headless）でスクリーンショットを撮る。
// 使い方: node scripts/build-og.mjs [--only=ar00,worry-tenshoku]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const OUT = DIST + 'assets/og/';
const W = 1200;
const H = 630;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME}（環境変数 CHROME で指定できます）`);

const deck = JSON.parse(readFileSync(DIST + 'assets/cards.json', 'utf8'));
const worries = JSON.parse(readFileSync(DATA + 'worries.json', 'utf8'));
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const img = (id) => pathToFileURL(DIST + `assets/rider-waite/${id}.jpg`).href;

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:#f2efe7;color:#1e2430;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;position:relative}
.frame{position:absolute;inset:24px;border:1.5px solid #1e2430}
.tag{font-size:17px;letter-spacing:.32em;font-weight:600}
.brand{position:absolute;left:72px;bottom:58px;display:flex;align-items:baseline;gap:22px}
.brand b{font-family:"Helvetica Neue",Helvetica,sans-serif;font-weight:900;font-size:46px;letter-spacing:-.02em;color:#111}
.brand span{font-size:19px;font-weight:600;letter-spacing:.08em}
.rule{position:absolute;left:72px;right:540px;bottom:128px;border-top:1.5px solid #1e2430}
.card{position:absolute;border-radius:14px;box-shadow:0 18px 40px rgba(17,17,17,.28);border:6px solid #fff}
.sun{position:absolute;border-radius:50%;background:#d8402f}
.slab{position:absolute;background:#f1d625}
`;

function page(body) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${body}</body></html>`;
}

function cardHtml(c) {
  const kws = c.upright.keywords.slice(0, 3);
  // 長い名前（例: ペンタクルのクイーン）も1行・540px以内に収める
  const size = Math.min(92, Math.floor(540 / (c.name.length * 1.03)));
  return page(`
<div class="slab" style="right:0;top:0;width:470px;height:${H}px"></div>
<div class="sun" style="right:330px;top:64px;width:120px;height:120px"></div>
<div class="frame"></div>
<img class="card" src="${img(c.id)}" style="right:118px;top:58px;height:512px;transform:rotate(5deg)">
<div style="position:absolute;left:72px;top:70px;width:560px">
  <p class="tag">TAROT × THINKING × YOU</p>
  <p style="margin-top:34px;font-size:22px;font-weight:600;letter-spacing:.12em">${esc(c.arcana)}</p>
  <h1 style="margin-top:8px;font-family:'Hiragino Mincho ProN',serif;font-weight:600;font-size:${size}px;line-height:1.1;letter-spacing:.02em;white-space:nowrap">${esc(c.name)}</h1>
  <p style="margin-top:10px;font-family:Didot,'Bodoni 72',serif;font-style:italic;font-size:36px">${esc(c.en)}</p>
  <p style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px">${kws.map((k) => `<span style="border:1.5px solid #1e2430;border-radius:999px;padding:8px 20px;font-size:22px;font-weight:600;background:#fff">${esc(k)}</span>`).join('')}</p>
</div>
<div class="rule"></div>
<div class="brand"><b>DECIDE.</b><span>心から納得いく決断を。</span></div>`);
}

function worryHtml(w) {
  const ids = [w.primary, ...w.cards.map((x) => x.id).filter((id) => id !== w.primary)].slice(0, 3);
  const fan = [
    { id: ids[1], right: 300, top: 120, rot: -12 },
    { id: ids[2], right: 70, top: 120, rot: 12 },
    { id: ids[0], right: 180, top: 70, rot: 0 },
  ];
  // 「◯◯で迷うとき」「◯◯するか迷うとき」を主見出し＋小見出しに分ける
  const m = w.h1.match(/^(.+?)(で迷うとき|迷うとき)$/);
  const main = m ? m[1] : w.h1;
  const sub = m ? m[2] : '';
  const size = Math.min(84, Math.floor(590 / (main.length * 1.02)));
  return page(`
<div class="slab" style="right:0;top:0;width:500px;height:${H}px"></div>
<div class="sun" style="right:420px;top:420px;width:110px;height:110px"></div>
<div class="frame"></div>
${fan.map((f) => `<img class="card" src="${img(f.id)}" style="right:${f.right}px;top:${f.top}px;height:420px;transform:rotate(${f.rot}deg)">`).join('')}
<div style="position:absolute;left:72px;top:70px;width:600px">
  <p class="tag">TAROT × THINKING × YOU</p>
  <p style="margin-top:40px;display:inline-block;background:#111;color:#f2efe7;font-size:22px;font-weight:700;letter-spacing:.14em;padding:6px 16px">悩み別ガイド</p>
  <h1 style="margin-top:22px;font-family:'Hiragino Mincho ProN',serif;font-weight:600;font-size:${size}px;line-height:1.15;white-space:nowrap">${esc(main)}${sub ? `<br><span style="font-size:52px">${esc(sub)}</span>` : ''}</h1>
  <p style="margin-top:20px;font-size:24px;font-weight:600;letter-spacing:.06em">タロットの視点で、考えを整理する</p>
</div>
<div class="rule"></div>
<div class="brand"><b>DECIDE.</b><span>心から納得いく決断を。</span></div>`);
}

const jobs = [
  ...deck.cards.map((c) => ({ name: c.id, html: () => cardHtml(c) })),
  ...worries.map((w) => ({ name: `worry-${w.slug}`, html: () => worryHtml(w) })),
].filter((j) => !only.length || only.includes(j.name));

// Chrome は撮影後も終了しないことがあるため、PNG のサイズが安定した時点で kill する
function shot(name, file, out, tmp) {
  return new Promise((resolve, reject) => {
    const p = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--user-data-dir=${join(tmp, `p-${name}`)}`,
      `--window-size=${W},${H}`, `--screenshot=${out}`,
      pathToFileURL(file).href,
    ], { stdio: 'ignore' });
    let last = -1;
    let stable = 0;
    const started = Date.now();
    const done = (err) => {
      clearInterval(timer);
      p.kill('SIGKILL');
      err ? reject(err) : resolve();
    };
    const timer = setInterval(() => {
      const size = existsSync(out) ? statSync(out).size : -1;
      if (size > 0 && size === last) stable += 1;
      else stable = 0;
      last = size;
      if (stable >= 3) done();
      else if (Date.now() - started > 30000) done(new Error(`timeout: ${name}`));
    }, 100);
    p.on('exit', () => {
      if (existsSync(out)) setTimeout(() => done(), 50);
      else done(new Error(`chrome exited without image: ${name}`));
    });
  });
}

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'decide-og-'));
try {
  const queue = [...jobs];
  const worker = async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      const file = join(tmp, `${j.name}.html`);
      writeFileSync(file, j.html());
      const out = `${OUT}${j.name}.png`;
      rmSync(out, { force: true });
      await shot(j.name, file, out, tmp);
      const png = readFileSync(out);
      if (png.readUInt32BE(16) !== W || png.readUInt32BE(20) !== H) throw new Error(`bad size: ${j.name}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`og images: ${jobs.length} → dist/assets/og/`);

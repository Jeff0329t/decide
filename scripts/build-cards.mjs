#!/usr/bin/env node
// Phase 4: SEO 用カード解説ページ（静的・JS 不要・ログイン不要）を生成する。
// 入力: dist/assets/cards.json + scripts/data/cards-extra-*.json
// 出力: dist/cards/index.html, dist/cards/{id}.html, dist/sitemap.xml, dist/robots.txt
// 使い方: node scripts/build-cards.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const ORIGIN = 'https://decisionprocess.net';
const MIN_CHARS = 800;
const CTA_TEXT = '今抱えている迷いを、このカードの視点から考えてみる';
const CREDIT = 'images: sixseeds/tarot-api, public domain';
const TODAY = new Date().toISOString().slice(0, 10);

const deck = JSON.parse(readFileSync(DIST + 'assets/cards.json', 'utf8'));
const extra = {};
for (const f of ['major', 'wands', 'cups', 'swords', 'pentacles']) {
  Object.assign(extra, JSON.parse(readFileSync(`${DATA}cards-extra-${f}.json`, 'utf8')));
}

const cards = deck.cards;
const byId = new Map(cards.map((c) => [c.id, c]));
const THEMES = deck.themes;
const LEVELS = deck.scoring.levels;
const ARCANA_ORDER = ['大アルカナ', 'ワンド', 'カップ', 'ソード', 'ペンタクル'];
const SUIT_PREFIX = { ワンド: 'wa', カップ: 'cu', ソード: 'sw', ペンタクル: 'pe' };
const SUIT_NOTE = {
  大アルカナ: '人生の大きな転機や価値観そのものを映す22枚。',
  ワンド: '情熱・行動・挑戦を司る火のスート。',
  カップ: '感情・人間関係・心の満足を司る水のスート。',
  ソード: '思考・判断・言葉を司る風のスート。',
  ペンタクル: 'お金・仕事・暮らしの土台を司る地のスート。',
};

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const countChars = (s) => String(s).replace(/\s/g, '').length;

function cardText(c) {
  const x = extra[c.id] || {};
  const side = (o) => [o.keywords.join(''), o.meaning, ...Object.values(o.themes)].join('');
  return [c.symbol, c.story, c.background, side(c.upright), side(c.reversed), x.hint || '', x.scene || '', x.check || ''].join('');
}

function related(c) {
  if (c.arcana === '大アルカナ') {
    const n = Number(c.id.slice(2));
    return [n - 1, n + 1].filter((i) => i >= 0 && i <= 21)
      .map((i) => byId.get('ar' + String(i).padStart(2, '0')));
  }
  const pre = c.id.slice(0, 2);
  const rank = Number(c.id.slice(2));
  const ids = [rank - 1, rank + 1].filter((r) => r >= 1 && r <= 14)
    .map((r) => pre + String(r).padStart(2, '0'));
  for (const p of Object.values(SUIT_PREFIX)) if (p !== pre) ids.push(p + String(rank).padStart(2, '0'));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

const imgBase = (id) => `../assets/rider-waite/${id}`;
const altOf = (c) => `${c.name}（${c.en}）のカード画像。ライダー版タロット`;

function picture(c, { eager = false, sizes = '(max-width: 600px) 60vw, 280px', w = 300, h = 520 } = {}) {
  const b = imgBase(c.id);
  return `<picture><source type="image/webp" srcset="${b}-320.webp 320w, ${b}-480.webp 480w" sizes="${sizes}"><img src="${b}.jpg" alt="${esc(altOf(c))}" width="${w}" height="${h}"${eager ? '' : ' loading="lazy"'} decoding="async"></picture>`;
}

const CSS = `:root{--ink:#1e2430;--soft:#f2efe7;--muted:#5b6270;--line:#d9d4c7;--card:#fffdf8;--accent:#f1d625}
@media (prefers-color-scheme: dark){:root{--ink:#e8e6e1;--soft:#111010;--muted:#a3a8b3;--line:#2e2c2a;--card:#1a1918}}
*{box-sizing:border-box}
body{margin:0;background:var(--soft);color:var(--ink);font-family:Inter,"Hiragino Sans","Yu Gothic UI","Yu Gothic",sans-serif;line-height:1.8}
a{color:inherit}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}
h1,h2,.serif{font-family:Didot,"Bodoni 72","Hiragino Mincho ProN","Yu Mincho",serif}
h1{font-size:1.7rem;line-height:1.35;margin:8px 0 4px}
h2{font-size:1.15rem;margin:36px 0 8px;padding-top:16px;border-top:1px solid var(--line)}
h3{font-size:1rem;margin:20px 0 4px}
.crumbs{font-size:.8rem;color:var(--muted)}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}
.crumbs li+li::before{content:"›";margin-right:4px}
.en{color:var(--muted);margin:0 0 16px;letter-spacing:.04em}
.hero{display:grid;grid-template-columns:minmax(0,220px) 1fr;gap:20px;align-items:start}
.hero img{width:100%;height:auto;display:block;border:2px solid #111;border-radius:6px;background:#111}
@media (max-width:560px){.hero{grid-template-columns:1fr}.hero picture{max-width:220px;margin:0 auto;display:block}}
.facts{margin:0;padding:0;list-style:none;font-size:.92rem}
.facts li{padding:6px 0;border-bottom:1px dashed var(--line)}
.facts b{display:inline-block;min-width:5.5em;color:var(--muted);font-weight:600}
.kw{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;padding:0;list-style:none}
.kw li{border:1.5px solid #111;background:var(--accent);color:#111;padding:0 10px;border-radius:999px;font-size:.85rem;font-weight:600}
.score{font-size:.9rem;color:var(--muted)}
.score strong{color:var(--ink)}
dl.themes{margin:8px 0 0}
dl.themes dt{font-weight:700;font-size:.9rem;margin-top:10px}
dl.themes dd{margin:0}
.cta{margin:32px 0;padding:20px 16px;background:var(--accent);color:#111;border:2px solid #111;border-radius:8px;box-shadow:4px 4px 0 #111;text-align:center}
.cta p{margin:0 0 10px;font-size:.9rem}
.cta a{display:inline-block;background:#111;color:var(--accent);font-weight:700;text-decoration:none;padding:10px 18px;border-radius:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:12px;margin:12px 0 0;padding:0;list-style:none}
.grid a{display:block;text-decoration:none;font-size:.82rem;line-height:1.4;text-align:center}
.grid img{width:100%;height:auto;display:block;border:1.5px solid #111;border-radius:4px;margin-bottom:4px;background:#111}
.note{font-size:.85rem;color:var(--muted)}
footer{max-width:720px;margin:0 auto;padding:16px 16px 48px;border-top:1px solid var(--line);font-size:.8rem;color:var(--muted)}
footer p{margin:4px 0}`;

function layout({ title, description, path, ogImage, ogType = 'article', ld, body }) {
  const url = ORIGIN + path;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#111010">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="DECIDE">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ogImage}">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
${ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n')}
<style>${CSS}</style>
</head>
<body>
${body}
<footer>
<p>${CREDIT}（ライダー＝ウェイト＝スミス版 1909年）</p>
<p>解釈は決断を考えるための一つの視点です。占いの結果や将来を保証するものではありません。</p>
<p class="meta"><a href="../tokushoho.html">特定商取引法に基づく表記</a> ／ <a href="../terms.html">利用規約</a> ／ <a href="../privacy.html">プライバシーポリシー</a> ／ <a href="../">DECIDE に戻る</a></p>
</footer>
</body>
</html>
`;
}

function crumbsHtml(items) {
  return `<nav class="crumbs" aria-label="パンくずリスト"><ol>${items.map((it, i) =>
    i === items.length - 1 ? `<li aria-current="page">${esc(it.name)}</li>` : `<li><a href="${it.href}">${esc(it.name)}</a></li>`
  ).join('')}</ol></nav>`;
}
const crumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: ORIGIN + it.path })),
});

const ctaHtml = (c, where) => `<aside class="cta" aria-label="DECIDE で考える">
<p>${where === 'mid' ? `${esc(c.name)}が示す視点を、あなた自身の選択肢に当てはめてみませんか。` : '二つの選択肢を並べて、カードと一緒に整理できます。'}</p>
<a href="../">${CTA_TEXT}</a>
</aside>`;

function sideHtml(c, key) {
  const o = c[key];
  const label = key === 'upright' ? '正位置' : '逆位置';
  return `<section>
<h2>${label}の意味</h2>
<ul class="kw" aria-label="${label}のキーワード">${o.keywords.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
<p>${esc(o.meaning)}</p>
<p class="score">${esc(deck.scoring.axis)}：<strong>${o.score} / 5（${esc(LEVELS[o.score])}）</strong></p>
<dl class="themes">${Object.entries(THEMES).map(([k, t]) => `<dt>${esc(t)}</dt><dd>${esc(o.themes[k])}</dd>`).join('')}</dl>
</section>`;
}

function cardPage(c) {
  const x = extra[c.id];
  const path = `/cards/${c.id}.html`;
  const title = `${c.name}（${c.en}）の意味｜正位置・逆位置と決断のヒント - DECIDE`;
  const description = `タロット「${c.name}」の象徴と、正位置（${c.upright.keywords.join('・')}）・逆位置（${c.reversed.keywords.join('・')}）の意味。迷いや決断の場面でどう読むかを解説します。`.slice(0, 160);
  const ogImage = `${ORIGIN}/assets/rider-waite/${c.id}.jpg`;
  const crumbs = [
    { name: 'DECIDE', href: '../', path: '/' },
    { name: 'カード解説', href: './', path: '/cards/' },
    { name: c.name, path },
  ];
  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `${c.name}（${c.en}）の意味と決断のヒント`,
    description, image: ogImage, inLanguage: 'ja',
    mainEntityOfPage: ORIGIN + path, datePublished: TODAY, dateModified: TODAY,
    author: { '@type': 'Organization', name: 'DECIDE' },
    publisher: { '@type': 'Organization', name: 'DECIDE', url: ORIGIN + '/' },
  };
  const rel = related(c);
  const body = `<main>
${crumbsHtml(crumbs)}
<article>
<h1>${esc(c.name)}の意味</h1>
<p class="en serif">${esc(c.en)}</p>
<div class="hero">
${picture(c, { eager: true })}
<div>
<ul class="facts">
<li><b>分類</b>${esc(c.arcana)}</li>
<li><b>象徴</b>${esc(c.symbol)}</li>
<li><b>正位置</b>${esc(c.upright.keywords.join('・'))}</li>
<li><b>逆位置</b>${esc(c.reversed.keywords.join('・'))}</li>
</ul>
<p>${esc(c.story)}</p>
</div>
</div>
<section>
<h2>描かれている象徴</h2>
<p>${esc(c.background)}</p>
</section>
${sideHtml(c, 'upright')}
${ctaHtml(c, 'mid')}
${sideHtml(c, 'reversed')}
<section>
<h2>決断・迷いにおけるヒント</h2>
<h3>決断の場面での読み方</h3>
<p>${esc(x.hint)}</p>
<h3>よくある迷いとの向き合い方</h3>
<p>${esc(x.scene)}</p>
<h3>決断前に自分に問いかけたいこと</h3>
<p>${esc(x.check)}</p>
<p class="note">「${esc(deck.scoring.axis)}」は、${esc(deck.scoring.definition)}</p>
</section>
${ctaHtml(c, 'end')}
<section>
<h2>関連するカード</h2>
<ul class="grid">${rel.map((r) => `<li><a href="./${r.id}.html">${picture(r, { sizes: '120px' })}${esc(r.name)}</a></li>`).join('')}</ul>
<p class="note"><a href="./">78枚すべてのカード解説を見る</a></p>
</section>
</article>
</main>`;
  return layout({ title, description, path, ogImage, ld: [article, crumbsLd(crumbs)], body });
}

function indexPage() {
  const path = '/cards/';
  const title = 'タロットカード78枚の意味一覧｜決断のヒント - DECIDE';
  const description = 'ライダー版タロット78枚それぞれの象徴、正位置・逆位置の意味、迷いや決断の場面での読み方をまとめた解説一覧です。';
  const crumbs = [{ name: 'DECIDE', href: '../', path: '/' }, { name: 'カード解説', path }];
  const groups = ARCANA_ORDER.map((a) => {
    const list = cards.filter((c) => c.arcana === a);
    return `<section>
<h2 id="${a === '大アルカナ' ? 'major' : SUIT_PREFIX[a]}">${esc(a)}（${list.length}枚）</h2>
<p class="note">${esc(SUIT_NOTE[a])}</p>
<ul class="grid">${list.map((c) => `<li><a href="./${c.id}.html">${picture(c, { sizes: '120px' })}${esc(c.name)}</a></li>`).join('')}</ul>
</section>`;
  }).join('\n');
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'タロットカード78枚の解説',
    itemListElement: cards.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/cards/${c.id}.html`, name: c.name })),
  };
  const body = `<main>
${crumbsHtml(crumbs)}
<h1>タロットカード78枚の意味</h1>
<p>DECIDE は、二つの選択肢で迷ったときにタロットの視点を借りて考えを整理するアプリです。ここでは78枚それぞれの象徴と、正位置・逆位置の意味、そして決断の場面での読み方を紹介します。カードは未来を言い当てるものではなく、見落としていた視点に気づくための問いかけとして使ってください。</p>
<div class="cta"><p>カードを引いて、いまの迷いを整理する</p><a href="../">${CTA_TEXT}</a></div>
${groups}
</main>`;
  return layout({
    title, description, path, ogType: 'website', ogImage: `${ORIGIN}/og-image-v3.png`,
    ld: [itemList, crumbsLd(crumbs)], body,
  });
}

// ---- 生成 ----
mkdirSync(DIST + 'cards', { recursive: true });
const thin = [];
for (const c of cards) {
  if (!extra[c.id]?.hint || !extra[c.id]?.scene || !extra[c.id]?.check) throw new Error(`extra text missing: ${c.id}`);
  const n = countChars(cardText(c));
  if (n < MIN_CHARS) thin.push({ id: c.id, name: c.name, chars: n });
  writeFileSync(`${DIST}cards/${c.id}.html`, cardPage(c));
}
writeFileSync(DIST + 'cards/index.html', indexPage());

const urls = [
  ['/', '1.0'], ['/cards/', '0.8'],
  ...cards.map((c) => [`/cards/${c.id}.html`, '0.6']),
  ['/privacy.html', '0.2'], ['/terms.html', '0.2'], ['/tokushoho.html', '0.2'],
];
writeFileSync(DIST + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, pr]) => `  <url><loc>${ORIGIN}${p}</loc><lastmod>${TODAY}</lastmod><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync(DIST + 'robots.txt', `User-agent: *
Allow: /
Disallow: /success.html
Sitemap: ${ORIGIN}/sitemap.xml
`);

const counts = cards.map((c) => countChars(cardText(c)));
console.log(`cards: ${cards.length} pages + index, sitemap ${urls.length} URLs`);
console.log(`card-specific chars: min ${Math.min(...counts)} / max ${Math.max(...counts)} (threshold ${MIN_CHARS})`);
if (thin.length) {
  console.log(`THIN CONTENT (< ${MIN_CHARS}):`);
  for (const t of thin) console.log(`  ${t.id} ${t.name}: ${t.chars}`);
  process.exitCode = 1;
} else {
  console.log('thin content: none');
}

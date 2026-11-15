#!/usr/bin/env node
// English static content pages under /en/ (cards, worries, articles).
// Run AFTER scripts/build-cards.mjs: this script never rewrites Japanese pages.
// It only (1) writes dist/en/cards/*.html and dist/en/articles/*.html and
// (2) merges /en/ entries into dist/sitemap.xml, preserving existing entries verbatim.
// Inputs: dist/assets/cards.json (ids, Japanese arcana, scores),
//   scripts/data/cards-en.json + scripts/data/cards-extra-en.json (card texts),
//   scripts/data/worries-en-a.json + scripts/data/worries-en-b.json (worry texts),
//   scripts/data/pages-en.json (category intros, index FAQ, worries intro/steps, groups),
//   scripts/data/articles-en/*.md (article texts),
//   scripts/data/worries.json + scripts/data/card-worry-links.json (structure)
// The About page (dist/en/about.html) is a hand-maintained static file, like the Japanese one.
// Usage: node scripts/build-en.mjs [--drafts]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, renderMarkdown } from './lib/markdown.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://decisionprocess.net';
const TODAY = new Date().toISOString().slice(0, 10);
const DRAFTS = process.argv.includes('--drafts');
const CTA_TEXT = 'Draw a card and organize your decision';
const CTA_HREF = '../../?lang=en&go=home';
const CREDIT = 'images: sixseeds/tarot-api, public domain (Rider–Waite–Smith deck, 1909)';

// ---- shared styles: reuse the exact CSS of the Japanese build (extracted, not forked) ----
const jaBuild = readFileSync(ROOT + 'scripts/build-cards.mjs', 'utf8');
const grab = (src, name) => {
  const m = src.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
  if (!m) throw new Error(`cannot extract ${name}`);
  return m[1];
};
const CSS = grab(jaBuild, 'CSS');
const INDEX_CSS = grab(jaBuild, 'INDEX_CSS').replace('content:"解説 →"', 'content:"Guide →"');
const APPNAV_CSS = grab(readFileSync(ROOT + 'scripts/lib/app-nav.mjs', 'utf8'), 'CSS');

// ---- data ----
const deck = JSON.parse(readFileSync(DIST + 'assets/cards.json', 'utf8'));
const baseEn = JSON.parse(readFileSync(DATA + 'cards-en.json', 'utf8'));
const extraEn = JSON.parse(readFileSync(DATA + 'cards-extra-en.json', 'utf8'));
const pagesEn = JSON.parse(readFileSync(DATA + 'pages-en.json', 'utf8'));
const worriesJa = JSON.parse(readFileSync(DATA + 'worries.json', 'utf8'));
const worriesEnParts = [...JSON.parse(readFileSync(DATA + 'worries-en-a.json', 'utf8')),
  ...JSON.parse(readFileSync(DATA + 'worries-en-b.json', 'utf8'))];
const worryEnBySlug = new Map(worriesEnParts.map((w) => [w.slug, w]));
const worries = worriesJa.map((w) => {
  const en = worryEnBySlug.get(w.slug);
  if (!en) throw new Error(`missing English worry: ${w.slug}`);
  return { ...en, slug: w.slug, primary: w.primary };
});
const worryBySlug = new Map(worries.map((w) => [w.slug, w]));
const cardWorryLinks = JSON.parse(readFileSync(DATA + 'card-worry-links.json', 'utf8'));

const cards = deck.cards.map((jc) => {
  const en = baseEn.cards[jc.id];
  if (!en) throw new Error(`missing English card: ${jc.id}`);
  const x = extraEn[jc.id];
  if (!x) throw new Error(`missing English card extra: ${jc.id}`);
  return {
    id: jc.id, arcanaJa: jc.arcana, name: en.name, arcana: en.arcana,
    symbol: en.symbol, story: en.story, background: en.background,
    upright: { ...en.upright, score: jc.upright.score },
    reversed: { ...en.reversed, score: jc.reversed.score },
    extra: x,
  };
});
const byId = new Map(cards.map((c) => [c.id, c]));
const THEMES_EN = baseEn.themes;

const ARCANA_ORDER = ['大アルカナ', 'ワンド', 'カップ', 'ソード', 'ペンタクル'];
const CAT_SLUG = { 大アルカナ: 'major', ワンド: 'wands', カップ: 'cups', ソード: 'swords', ペンタクル: 'pentacles' };
const SUIT_KICKER = pagesEn.suitKicker;
const catOf = (c) => c.arcanaJa;
const catLabel = (a) => pagesEn.categories[a].label;

const AXIS = 'Ease of moving forward';
const LEVELS = { 1: 'Pause for now', 2: 'Prepare and rethink first', 3: 'Depends on the conditions', 4: 'Easy to move forward', 5: 'A strong tailwind' };
const AXIS_NOTE = `"${AXIS}" is the strength of the tailwind behind an option if you move on it now — not a judgment of whether things will turn out well or badly.`;

const WORRY_GROUPS = [
  { id: 'work', slugs: ['tenshoku', 'shukatsu', 'fukugyo', 'dokuritsu', 'manabi', 'taishoku', 'yasumu', 'naitei', 'tenkin', 'shikaku', 'ryugaku', 'shingaku', 'fukugyo-kaisha'] },
  { id: 'love', slugs: ['renai', 'kekkon', 'wakare', 'kaigo', 'kokuhaku', 'present', 'kekkonshiki', 'fukuen'] },
  { id: 'life', slugs: ['hikkoshi', 'okane', 'ningen', 'kuruma', 'nemurenai', 'iku', 'kotowaru', 'renraku', 'ayamaru', 'kaiyaku', 'ryokou', 'toshi', 'hoken', 'kasu', 'nomikai', 'pet'] },
];
const GROUP_KICKER = { work: 'WORK', love: 'LOVE', life: 'LIFE' };
function groupedWorries() {
  const grouped = new Set(WORRY_GROUPS.flatMap((g) => g.slugs));
  const groups = WORRY_GROUPS.map((g) => ({ id: g.id, ...pagesEn.groups[g.id], items: g.slugs.map((x) => worryBySlug.get(x)).filter(Boolean) }));
  const rest = worries.filter((w) => !grouped.has(w.slug));
  if (rest.length) groups.push({ id: 'other', ...pagesEn.groups.other, items: rest });
  return groups;
}

// ---- articles (English markdown; same validation rules as the Japanese loader) ----
function loadArticlesEn(dir) {
  if (!existsSync(dir)) return [];
  const worrySet = new Set(worriesJa.map((w) => w.slug));
  const cardSet = new Set(cards.map((c) => c.id));
  const REQUIRED = ['slug', 'title', 'h1', 'description', 'date', 'keyword', 'primary'];
  const seen = new Set();
  const list = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const { data, body } = parseFrontMatter(readFileSync(dir + f, 'utf8'));
    for (const k of REQUIRED) if (!data[k] || typeof data[k] !== 'string') throw new Error(`${f}: front matter "${k}" is required`);
    if (!/^[a-z0-9-]+$/.test(data.slug)) throw new Error(`${f}: bad slug ${data.slug}`);
    if (seen.has(data.slug)) throw new Error(`${f}: duplicate slug ${data.slug}`);
    seen.add(data.slug);
    const wlist = data.worries || [];
    const clist = data.cards || [];
    if (!Array.isArray(wlist) || !Array.isArray(clist)) throw new Error(`${f}: worries/cards must be [a, b]`);
    for (const w of wlist) if (!worrySet.has(w)) throw new Error(`${f}: unknown worry ${w}`);
    for (const c of [data.primary, ...clist]) if (!cardSet.has(c)) throw new Error(`${f}: unknown card ${c}`);
    if (typeof data.draft !== 'boolean') throw new Error(`${f}: draft must be true or false`);
    if (data.draft && !DRAFTS) continue;
    const rendered = renderMarkdown(body);
    // Article pages live one level deeper under /en/, so asset paths need one more ../
    const html = rendered.html.replaceAll('../assets/', '../../assets/');
    list.push({ ...data, worries: wlist, cards: clist, file: f, ...rendered, html });
  }
  return list.sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
}
const articles = loadArticlesEn(DATA + 'articles-en/');
const published = articles.filter((a) => !a.draft);

// ---- helpers ----
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const countChars = (s) => String(s).replace(/\s/g, '').length;
const kick = (t, cls = 'sec-k') => `<p class="kicker ${cls}">${esc(t)}</p>`;
const meter = (n) => `<span class="meter" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i${i <= n ? ' class="on"' : ''}></i>`).join('')}</span>`;

const imgBase = (id) => `../../assets/rider-waite/${id}`;
const altOf = (c) => `The ${c.name} tarot card (Rider–Waite)`;
function picture(c, { eager = false, sizes = '(max-width: 600px) 60vw, 280px', w = 300, h = 520 } = {}) {
  const b = imgBase(c.id);
  return `<picture><source type="image/webp" srcset="${b}-320.webp 320w, ${b}-480.webp 480w" sizes="${sizes}"><img src="${b}.jpg" alt="${esc(altOf(c))}" width="${w}" height="${h}"${eager ? '' : ' loading="lazy"'} decoding="async"></picture>`;
}
const gridHtml = (list) => `<ul class="grid">${list.map((r) => `<li><a href="./${r.id}">${picture(r, { sizes: '120px' })}${esc(r.name)}</a></li>`).join('')}</ul>`;

function crumbsHtml(items) {
  const parent = [...items.slice(0, -1)].reverse().find((it) => it.href);
  const back = parent ? `<a class="back" href="${parent.href}" aria-label="Back to ${esc(parent.name)}">← Back</a>` : '';
  return `<div class="topbar">${back}<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) =>
    i === items.length - 1 ? `<li aria-current="page">${esc(it.name)}</li>` : `<li><a href="${it.href}">${esc(it.name)}</a></li>`
  ).join('')}</ol></nav></div>`;
}
const crumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: ORIGIN + it.path })),
});

// App bottom navigation (English labels, same design as the Japanese static pages).
function appNavHtml(body) {
  const parent = body.match(/<a class="back" href="([^"]+)"/)?.[1] || CTA_HREF;
  const isApp = parent === CTA_HREF || parent.startsWith('../../?lang=en');
  return `<!-- app-nav:start -->
<style>${APPNAV_CSS}</style>
<nav class="app-nav" aria-label="DECIDE. menu">
<a href="${parent}" data-go="back" aria-label="${isApp ? 'Back to home' : 'Back to the previous list'}"><span>Back</span></a>
<a href="${CTA_HREF}" data-go="home"><span>Home</span></a>
<a href="../../?lang=en&go=history" data-go="history"><span>Log</span></a>
<a href="../../?lang=en&go=stats" data-go="stats"><span>Stats</span></a>
<a href="../../?lang=en&go=settings" data-go="settings"><span>Settings</span></a>
</nav>
<!-- app-nav:end -->`;
}

// ---- "Next decisions" circulation block (mirrors the Japanese 次の迷い block) ----
const POPULAR_WORRIES = ['tenshoku', 'renai', 'okane', 'hikkoshi', 'nemurenai'];
function nextWorriesHtml({ base, seeds }) {
  const shown = new Set(seeds);
  const item = (w) => `<li><a href="${base}worry-${w.slug}">${esc(w.h1)}</a></li>`;
  const popular = POPULAR_WORRIES.map((s) => worryBySlug.get(s)).filter((w) => w && !shown.has(w.slug));
  popular.forEach((w) => shown.add(w.slug));
  let genreName = '';
  let genreItems = [];
  for (const seed of seeds) {
    const g = groupedWorries().find((x) => x.items.some((w) => w.slug === seed));
    if (!g) continue;
    const picks = g.items.filter((w) => !shown.has(w.slug)).slice(0, 3);
    if (picks.length) { genreName = g.name; genreItems = picks; break; }
  }
  if (!popular.length && !genreItems.length) return '';
  return `<section class="next-worries">
${kick('NEXT DECISIONS')}
<h2>Next decisions</h2>
<h3>Decisions people often face</h3>
<ul>
${popular.map(item).join('\n')}
</ul>${genreItems.length ? `
<h3>${esc(genreName)}</h3>
<ul>
${genreItems.map(item).join('\n')}
</ul>` : ''}
</section>`;
}

function layout({ title, description, path, ogImage, ogType = 'article', ld, body, noindex = false, css = '', next = null }) {
  const url = ORIGIN + path;
  let fullBody = body;
  if (next) {
    const block = nextWorriesHtml(next);
    const mainEnd = fullBody.lastIndexOf('</main>');
    if (block && mainEnd !== -1) fullBody = fullBody.slice(0, mainEnd) + block + '\n' + fullBody.slice(mainEnd);
  }
  const inCards = path.startsWith('/en/cards');
  const footLinks = inCards
    ? `<a href="../about">About DECIDE.</a> ／ <a href="./">Card meanings</a> ／ <a href="./worries">By decision</a> ／ <a href="../articles/">Reading</a> ／ <a href="../../?lang=en">Open DECIDE.</a>`
    : `<a href="../about">About DECIDE.</a> ／ <a href="../cards/">Card meanings</a> ／ <a href="../cards/worries">By decision</a> ／ <a href="./">Reading</a> ／ <a href="../../?lang=en">Open DECIDE.</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">${noindex ? '\n<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#f4efe3">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="DECIDE.">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ogImage}">
<link rel="icon" href="../../icon-192.png" type="image/png">
${ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n')}
<style>${CSS}${css ? '\n' + css : ''}</style>
</head>
<body>
${fullBody}
<footer>
<p>${CREDIT}</p>
<p>These readings are one viewpoint for thinking through a decision. They do not guarantee any outcome or what the future holds.</p>
<p class="meta">${footLinks}</p>
</footer>
${appNavHtml(fullBody)}
</body>
</html>
`;
}

const ctaHtml = (msg = 'Lay your two options side by side and sort them out with a card.', btn = CTA_TEXT) => `<aside class="cta" aria-label="Your next step">
<p>${esc(msg)}</p>
<a href="${CTA_HREF}">${esc(btn)}</a>
</aside>`;

function related(c) {
  if (c.arcanaJa === '大アルカナ') {
    const n = Number(c.id.slice(2));
    return [n - 1, n + 1].filter((i) => i >= 0 && i <= 21)
      .map((i) => byId.get('ar' + String(i).padStart(2, '0')));
  }
  const pre = c.id.slice(0, 2);
  const rank = Number(c.id.slice(2));
  const ids = [rank - 1, rank + 1].filter((r) => r >= 1 && r <= 14)
    .map((r) => pre + String(r).padStart(2, '0'));
  for (const p of ['wa', 'cu', 'sw', 'pe']) if (p !== pre) ids.push(p + String(rank).padStart(2, '0'));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
function suitNeighbors(c) {
  const suit = cards.filter((o) => o.arcanaJa === c.arcanaJa);
  const i = suit.findIndex((o) => o.id === c.id);
  return [suit[i - 1], suit[i + 1]];
}
function sameScore(c, exclude) {
  const skip = new Set([c.id, ...exclude.map((r) => r.id)]);
  const i = cards.indexOf(c);
  return cards
    .filter((o) => o.upright.score === c.upright.score && !skip.has(o.id))
    .sort((a, b) => Math.abs(cards.indexOf(a) - i) - Math.abs(cards.indexOf(b) - i))
    .slice(0, 4);
}
function firstQuestion(text) {
  const q = String(text).match(/[^.]*?\?/);
  if (q) return q[0].trim();
  const i = String(text).indexOf('. ');
  return i === -1 ? String(text) : String(text).slice(0, i + 1);
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${dd}, ${y}`; };

// ---- card pages ----
function sideHtml(c, key) {
  const o = c[key];
  const label = key === 'upright' ? 'Upright' : 'Reversed';
  return `<section>
${kick(key === 'upright' ? 'UPRIGHT' : 'REVERSED')}
<h2>${label} meaning</h2>
<ul class="kw" aria-label="${label} keywords">${o.keywords.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
<p>${esc(o.meaning)}</p>
<p class="score">${esc(AXIS)}${meter(o.score)}<strong>${o.score} / 5 (${esc(LEVELS[o.score])})</strong></p>
<dl class="themes">${Object.entries(THEMES_EN).map(([k, t]) => `<dt>${esc(t)}</dt><dd>${esc(o.themes[k])}</dd>`).join('')}</dl>
</section>`;
}

function dsceneHtml(x) {
  const d = x && x.decision;
  if (!d) return '';
  const w = worryBySlug.get(d.worry);
  return `<div class="dscene">
<p><b>Reading it in a decision</b> — ${esc(d.text)}</p>
<p class="dscene-link">The decision this speaks to: <a href="./worry-${d.worry}">${esc(w ? w.h1 : d.worry)}</a></p>
</div>`;
}

function cardPage(c) {
  const path = `/en/cards/${c.id}`;
  const title = `${c.name} — Tarot Meaning | Upright, Reversed & Decision Hints - DECIDE.`;
  const description = `The symbolism of the tarot card "${c.name}", its upright (${c.upright.keywords.join(', ')}) and reversed (${c.reversed.keywords.join(', ')}) meanings, and how to read it when you're facing a decision.`.slice(0, 170);
  const ogImage = `${ORIGIN}/assets/og/${c.id}.jpg`;
  const cat = catOf(c);
  const crumbs = [
    { name: 'DECIDE.', href: '../../?lang=en', path: '/en/' },
    { name: 'Card meanings', href: './', path: '/en/cards/' },
    { name: catLabel(cat), href: `./${CAT_SLUG[cat]}`, path: `/en/cards/${CAT_SLUG[cat]}` },
    { name: c.name, path },
  ];
  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `${c.name} — Meaning and Decision Hints`,
    description, image: `${ORIGIN}/assets/rider-waite/${c.id}.jpg`, inLanguage: 'en',
    mainEntityOfPage: ORIGIN + path, datePublished: TODAY, dateModified: TODAY,
    author: { '@type': 'Organization', name: 'DECIDE.' },
    publisher: { '@type': 'Organization', name: 'DECIDE.', url: ORIGIN + '/' },
  };
  const rel = related(c);
  const same = sameScore(c, rel);
  const [prev, next] = suitNeighbors(c);
  const x = c.extra;
  const ctaPair = c.id === 'cu12'
    ? ['Tell them how you feel, or accept what they are offering? Draw a card and sort out what is on your mind.', 'Draw a card and sort out how you feel']
    : ['Now that you have read the meaning, turn to the decision in front of you. Draw a card and lay your two options side by side.', 'Draw a card and organize your decision'];
  const relWorries = (cardWorryLinks[c.id] || []).map((s) => worryBySlug.get(s)).filter(Boolean);
  const body = `<main>
${crumbsHtml(crumbs)}
<article>
${kick(SUIT_KICKER[cat], 'page-k')}
<h1>${esc(c.name)} — Meaning</h1>
<p class="en serif">${esc(c.arcana)}</p>
<div class="hero">
${picture(c, { eager: true })}
<div>
<ul class="facts">
<li><b>Category</b><a href="./${CAT_SLUG[cat]}">${esc(catLabel(cat))}</a></li>
<li><b>Symbol</b>${esc(c.symbol)}</li>
<li><b>Upright</b>${esc(c.upright.keywords.join(', '))}</li>
<li><b>Reversed</b>${esc(c.reversed.keywords.join(', '))}</li>
</ul>
<p>${esc(c.story)}</p>
</div>
</div>
<p class="verdict">${esc(c.name)} stands for "${esc(c.upright.keywords.join(', '))}" when upright, and "${esc(c.reversed.keywords.join(', '))}" when reversed. ${esc(c.upright.meaning)}</p>
${dsceneHtml(x)}
<section>
${kick('SYMBOLS')}
<h2>The symbols in the picture</h2>
<p>${esc(c.background)}</p>
</section>
${sideHtml(c, 'upright')}
${sideHtml(c, 'reversed')}
<section>
${kick('FOR YOUR DECISION')}
<h2>Hints for your decision</h2>
<h3>How to read it when you are deciding</h3>
<p>${esc(x.hint)}</p>
<h3>How to face a familiar worry</h3>
<p>${esc(x.scene)}</p>
<h3>Questions to ask yourself before you decide</h3>
<p>${esc(x.check)}</p>
<p class="note">${esc(AXIS_NOTE)}</p>
</section>
${ctaHtml(ctaPair[0], ctaPair[1])}
<section>
${kick('RELATED WORRIES')}
<h2>Decisions to think through with this card</h2>
<p>${c.id === 'cu12' ? 'Tell them how you feel, or accept what they are offering? Start from a theme close to yours and find hints for sorting it out.' : 'Start from a theme close to the decision in front of you, and find ways of thinking and questions to ask yourself.'}</p>
<ul class="cats" aria-label="Related decisions">
${relWorries.map((w) => `<li><a href="./worry-${w.slug}">${esc(w.h1)}</a></li>`).join('\n')}
</ul>
<p class="note"><a href="./">All 78 tarot card meanings</a></p>
</section>
<section>
${kick('RELATED CARDS')}
<h2>Related cards</h2>
${gridHtml(rel)}
${same.length ? `<h3>Cards with the same upright score (${c.upright.score} / 5)</h3>
${gridHtml(same)}` : ''}
<p class="note"><a href="./${CAT_SLUG[cat]}">${esc(catLabel(cat))} cards (${cards.filter((o) => o.arcanaJa === cat).length})</a> ／ <a href="./">All 78 tarot card meanings</a></p>
<nav aria-label="Previous and next cards"><ul class="pager">
<li class="prev">${prev ? `<a href="./${prev.id}" rel="prev"><small>← Previous card</small>${esc(prev.name)}</a>` : ''}</li>
<li class="next">${next ? `<a href="./${next.id}" rel="next"><small>Next card →</small>${esc(next.name)}</a>` : ''}</li>
</ul></nav>
</section>
</article>
</main>`;
  return layout({ title, description, path, ogImage, ld: [article, crumbsLd(crumbs)], body, next: { base: './', seeds: cardWorryLinks[c.id] || [] } });
}

// ---- category pages ----
function catsNav(current) {
  return `<ul class="cats" aria-label="Categories">${ARCANA_ORDER.map((a) => a === current
    ? `<li aria-current="page">${esc(catLabel(a))}</li>`
    : `<li><a href="./${CAT_SLUG[a]}">${esc(catLabel(a))}</a></li>`).join('')}<li><a href="./">All 78 cards</a></li></ul>`;
}

function categoryPage(a) {
  const list = cards.filter((c) => c.arcanaJa === a);
  const path = `/en/cards/${CAT_SLUG[a]}`;
  const label = catLabel(a);
  const title = a === '大アルカナ'
    ? `The 22 Major Arcana — Meanings | Upright, Reversed & Decision Hints - DECIDE.`
    : `${label} (${list.length} cards) — Meanings | Minor Arcana & Decision Hints - DECIDE.`;
  const description = `${pagesEn.suitNote[a]} Upright and reversed keywords for each of the ${list.length} ${label} cards, and how to read them when you are facing a decision.`.slice(0, 170);
  const crumbs = [
    { name: 'DECIDE.', href: '../../?lang=en', path: '/en/' },
    { name: 'Card meanings', href: './', path: '/en/cards/' },
    { name: label, path },
  ];
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: `${label} card meanings`,
    itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/en/cards/${c.id}`, name: c.name })),
  };
  const rows = list.map((c) => `<li><a href="./${c.id}"><b>${esc(c.name)}</b></a>: upright "${esc(c.upright.keywords.join(', '))}" / reversed "${esc(c.reversed.keywords.join(', '))}"</li>`).join('\n');
  const body = `<main>
${crumbsHtml(crumbs)}
${kick(SUIT_KICKER[a], 'page-k')}
<h1>${esc(label)} meanings (${list.length} cards)</h1>
${catsNav(a)}
<p>${esc(pagesEn.categories[a].intro)}</p>
${gridHtml(list)}
<div class="cta"><p>Use the viewpoint of ${esc(label)} to lay your own two options side by side.</p><a href="${CTA_HREF}">${CTA_TEXT}</a></div>
<section>
<h2>${esc(label)} keywords at a glance</h2>
<ul>
${rows}
</ul>
</section>
<p class="note"><a href="./">All 78 tarot card meanings</a></p>
</main>`;
  return layout({ title, description, path, ogType: 'website', ogImage: `${ORIGIN}/assets/rider-waite/${list[0].id}.jpg`, ld: [itemList, crumbsLd(crumbs)], body });
}

// ---- cards index ----
const INDEX_FAQ = pagesEn.indexFaq;
function indexPage() {
  const path = '/en/cards/';
  const title = 'All 78 Tarot Card Meanings | Hints for Your Decisions - DECIDE.';
  const description = 'Explanations of all 78 tarot cards — the symbols in each picture, upright and reversed meanings, and how to read each card when you are facing a decision.';
  const crumbs = [{ name: 'DECIDE.', href: '../../?lang=en', path: '/en/' }, { name: 'Card meanings', path }];
  const worryCell = (w) => {
    const c = byId.get(w.primary);
    const ask = w.sections.find((x) => x.h2 === 'Questions to ask yourself');
    return `<li><a class="wcell" href="./worry-${w.slug}">${picture(c, { sizes: '48px' })}<span><b>${esc(w.short || w.h1)}</b><small>${esc(ask ? firstQuestion(ask.p) : w.description)}</small></span></a></li>`;
  };
  const worryGroups = groupedWorries().map((g) => `<h3 class="grp"><span class="kicker">${esc(GROUP_KICKER[g.id] || 'OTHER')}</span>${esc(g.name)}</h3>
<ul class="wgrid">
${g.items.map(worryCell).join('\n')}
</ul>`).join('\n');
  const suits = ARCANA_ORDER.map((a) => {
    const list = cards.filter((c) => c.arcanaJa === a);
    const cells = list.map((c) => `<li><a href="./${c.id}">${picture(c, { sizes: '(max-width: 620px) 30vw, 160px' })}<b>${esc(c.name)}</b><small>${esc(c.upright.keywords.slice(0, 2).join(', '))}</small></a></li>`).join('\n');
    return `<section class="suit" id="${a === '大アルカナ' ? 'major' : { ワンド: 'wa', カップ: 'cu', ソード: 'sw', ペンタクル: 'pe' }[a]}">
<div class="suit-head"><p class="kicker">${esc(SUIT_KICKER[a])}</p><h3><a href="./${CAT_SLUG[a]}">${esc(catLabel(a))}<small>${list.length} cards</small></a></h3><p>${esc(pagesEn.suitNote[a])}</p></div>
<ul class="cgrid">
${cells}
</ul>
</section>`;
  }).join('\n');
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Explanations of all 78 tarot cards',
    itemListElement: cards.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/en/cards/${c.id}`, name: c.name })),
  };
  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: INDEX_FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const faqHtml = `<section class="idx-sec" id="faq">
<div class="sec-head"><p class="kicker">04 — FAQ</p><h2>Frequently asked questions</h2></div>
${INDEX_FAQ.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}
</section>`;
  const body = `<main class="idx">
${crumbsHtml(crumbs)}
<header class="idx-head">
<p class="kicker">INDEX — CARDS &amp; WORRIES</p>
<h1>Cards &amp; decisions</h1>
<p class="idx-sub">The meanings of all 78 tarot cards, and guides for ${worries.length} decisions</p>
<p class="idx-lead">Read the thinking behind a decision close to yours, or look up the meaning of the card you drew. Cards are not prophecies about the future — they are questions that help you notice what you have been overlooking.</p>
<nav class="doors" aria-label="Choose how to search">
<a class="door dark" href="#worries"><span class="kicker">BY WORRY</span><strong>Start from a decision</strong><span>Changing jobs, love, money and ${worries.length} themes in all</span></a>
<a class="door lite" href="#cards"><span class="kicker">BY CARD</span><strong>Start from a card</strong><span>Look up the card you drew</span></a>
</nav>
</header>
<section class="idx-sec" id="worries">
<div class="sec-head"><p class="kicker">01 — BY WORRY</p><h2>Start from a decision</h2></div>
<p class="sec-lead">Open a theme close to yours to read what the decision is really about, how to sort it out, and the cards connected to it.</p>
${worryGroups}
<p class="more"><a href="./worries">Compare all ${worries.length} decisions, with explanations →</a></p>
</section>
<section class="idx-sec" id="cards">
<div class="sec-head"><p class="kicker">02 — BY CARD</p><h2>Start from a card</h2></div>
<nav class="suits" aria-label="Jump to a suit">${ARCANA_ORDER.map((a) => `<a href="#${a === '大アルカナ' ? 'major' : { ワンド: 'wa', カップ: 'cu', ソード: 'sw', ペンタクル: 'pe' }[a]}">${esc(catLabel(a))}<small>${cards.filter((c) => c.arcanaJa === a).length}</small></a>`).join('')}</nav>
${suits}
<p class="more">Guides by suit: ${ARCANA_ORDER.map((a) => `<a href="./${CAT_SLUG[a]}">${esc(catLabel(a))}</a>`).join(' / ')}</p>
</section>
${published.length ? `<section class="idx-sec" id="articles">
<div class="sec-head"><p class="kicker">03 — READING</p><h2>Reading</h2></div>
<ul class="alist">${published.slice(0, 5).map((a) => `<li><a href="../articles/${a.slug}">${esc(a.h1)}</a></li>`).join('')}</ul>
<p class="more"><a href="../articles/">All articles →</a></p>
</section>` : ''}
${faqHtml}
<aside class="idx-cta" aria-label="Decide with DECIDE.">
<p class="kicker">YOUR TURN</p>
<p>Read enough? Now bring your own decision.<br>Draw a card and lay out your options.</p>
<a href="${CTA_HREF}">Draw a card and decide<span aria-hidden="true">→</span></a>
</aside>
</main>`;
  return layout({
    title, description, path, ogType: 'website', ogImage: `${ORIGIN}/og-image-v3.png`,
    ld: [itemList, faqLd, crumbsLd(crumbs)], body, css: INDEX_CSS,
  });
}

// ---- worry pages ----
function worriesNav(current) {
  return `<ul class="cats" aria-label="By decision">${worries.map((w) => w.slug === current
    ? `<li aria-current="page">${esc(w.h1)}</li>`
    : `<li><a href="./worry-${w.slug}">${esc(w.h1)}</a></li>`).join('')}<li><a href="./worries">All decisions</a></li></ul>`;
}

function worryPage(w) {
  const path = `/en/cards/worry-${w.slug}`;
  const ogImage = `${ORIGIN}/assets/og/worry-${w.slug}.jpg`;
  const crumbs = [
    { name: 'DECIDE.', href: '../../?lang=en', path: '/en/' },
    { name: 'Card meanings', href: './', path: '/en/cards/' },
    { name: 'By decision', href: './worries', path: '/en/cards/worries' },
    { name: w.h1, path },
  ];
  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: w.h1, description: w.description, image: `${ORIGIN}/assets/rider-waite/${w.primary}.jpg`, inLanguage: 'en',
    mainEntityOfPage: ORIGIN + path, datePublished: TODAY, dateModified: TODAY,
    author: { '@type': 'Organization', name: 'DECIDE.' },
    publisher: { '@type': 'Organization', name: 'DECIDE.', url: ORIGIN + '/' },
  };
  const cardRows = w.cards.map(({ id, reason }) => {
    const c = byId.get(id);
    return `<li><a href="./${id}">${picture(c, { sizes: '96px' })}<div><h3>${esc(c.name)}</h3><p>${esc(reason)}</p></div></a></li>`;
  }).join('\n');
  const relArticles = published.filter((a) => a.worries.includes(w.slug));
  const sectionsHtml = w.sections.map((s, i) => {
    let inner;
    if (s.h2 === 'How to read the cards' && Array.isArray(s.segments) && s.segments.length) {
      inner = s.segments.map((seg) => seg.card
        ? `<figure class="art-img">${picture(byId.get(seg.card), { sizes: '(max-width: 600px) 55vw, 170px' })}</figure>\n<p>${esc(seg.text)}</p>`
        : `<p>${esc(seg.text)}</p>`).join('\n');
    } else {
      inner = `<p>${esc(s.p)}</p>`;
    }
    return `<section${s.h2 === 'Questions to ask yourself' ? ' class="asks"' : ''}>\n${kick(`POINT ${String(i + 1).padStart(2, '0')}`)}\n<h2>${esc(s.h2)}</h2>\n${inner}\n</section>`;
  }).join('\n');
  const faqLd = w.faq?.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: w.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  } : null;
  const faqHtml = w.faq?.length ? `<section>
${kick('FAQ')}
<h2>Frequently asked questions</h2>
${w.faq.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}
</section>
` : '';
  const group = WORRY_GROUPS.find((g) => g.slugs.includes(w.slug));
  const body = `<main>
${crumbsHtml(crumbs)}
<article>
${kick(`WORRY GUIDE — ${GROUP_KICKER[group?.id] || 'OTHER'}`, 'page-k')}
<h1>${esc(w.h1)}</h1>
<p>${esc(w.lead)}</p>
<figure class="art-hero">${picture(byId.get(w.primary), { eager: true, sizes: '(max-width: 600px) 68vw, 300px' })}</figure>
${sectionsHtml}
<section>
${kick('CARDS')}
<h2>Cards connected to this decision</h2>
<ul class="wcards">
${cardRows}
</ul>
</section>
${faqHtml}${ctaHtml(w.cta[0], w.cta[1])}
${relArticles.length ? `<section>
${kick('READING')}
<h2>Read deeper on this decision</h2>
<ul class="cats">${relArticles.map((a) => `<li><a href="../articles/${a.slug}">${esc(a.h1)}</a></li>`).join('')}</ul>
</section>
` : ''}<section>
${kick('MORE WORRIES')}
<h2>Explore other decisions</h2>
${worriesNav(w.slug)}
<p class="note"><a href="./">All 78 tarot card meanings</a></p>
</section>
</article>
</main>`;
  return layout({ title: w.title, description: w.description, path, ogImage, ld: [article, ...(faqLd ? [faqLd] : []), crumbsLd(crumbs)], body, css: '.art-hero{margin:22px 0 4px;text-align:center}.art-hero img{width:300px;max-width:68%;height:auto;border-radius:12px;border:5px solid #fff;box-shadow:0 14px 30px rgba(17,17,17,.22)}.art-img{margin:20px 0;text-align:center}.art-img img{width:170px;max-width:55%;height:auto;border-radius:10px;border:4px solid #fff;box-shadow:0 10px 24px rgba(17,17,17,.18)}', next: { base: './', seeds: [w.slug] } });
}

function worriesIndex() {
  const path = '/en/cards/worries';
  const title = 'Reading Tarot by Decision | Changing Jobs, Love, Moving & How to Decide - DECIDE.';
  const description = `For ${worries.length} common decisions — changing jobs, job hunting, a side business, love, marriage, caregiving, moving, money and more — how to sort out your thinking, and the tarot cards that lend you a viewpoint.`;
  const crumbs = [
    { name: 'DECIDE.', href: '../../?lang=en', path: '/en/' },
    { name: 'Card meanings', href: './', path: '/en/cards/' },
    { name: 'By decision', path },
  ];
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Tarot guides by decision',
    itemListElement: worries.map((w, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/en/cards/worry-${w.slug}`, name: w.h1 })),
  };
  const groups = groupedWorries();
  const tile = (w) => {
    const c = byId.get(w.primary);
    const ask = w.sections.find((x) => x.h2 === 'Questions to ask yourself');
    return `<li class="wtile"><a class="wtile-head" href="./worry-${w.slug}">${picture(c, { sizes: '64px' })}<h3>${esc(w.h1)}<small>Key card: ${esc(c.name)}</small></h3></a>
<div class="wtile-body"><p>${esc(w.description)}</p>${ask ? `<p class="wtile-q">${esc(firstQuestion(ask.p))}</p>` : ''}
<ul class="wtile-cards" aria-label="Related cards">${w.cards.map((x) => `<li><a href="./${x.id}">${esc(byId.get(x.id).name)}</a></li>`).join('')}</ul></div>
<a class="wtile-more" href="./worry-${w.slug}" aria-label="Read: ${esc(w.h1)}">Read the thinking →</a></li>`;
  };
  const sections = groups.map((g) => `<section id="${g.id}">
<h2>${esc(g.name)}</h2>
${g.lead ? `<p class="wgroup-lead">${esc(g.lead)}</p>` : ''}
<ul class="wtiles">
${g.items.map(tile).join('\n')}
</ul>
</section>`).join('\n');
  const body = `<main>
${crumbsHtml(crumbs)}
${kick('WORRY GUIDE', 'page-k')}
<h1>Reading tarot by decision</h1>
${pagesEn.worriesIntro.map((p, i) => `<p${i === 0 ? ' class="lede"' : ''}>${esc(p)}</p>`).join('\n')}
<h2>How to use this page</h2>
<ol class="steps">
${pagesEn.worriesSteps.map((s) => `<li><b>${esc(s.lead)}</b>${esc(s.text)}</li>`).join('\n')}
</ol>
<nav aria-label="Browse by theme"><ul class="wjump">
${worries.map((w) => `<li><a href="./worry-${w.slug}">${esc(w.short || w.h1)}</a></li>`).join('\n')}
</ul></nav>
${sections}
<div class="cta"><p>Once you have read the card meanings, turn to your own two options.</p><a href="${CTA_HREF}">${CTA_TEXT}</a></div>
<p class="note"><a href="./">All 78 tarot card meanings</a></p>
</main>`;
  return layout({ title, description, path, ogType: 'website', ogImage: `${ORIGIN}/og-image-v3.png`, ld: [itemList, crumbsLd(crumbs)], body });
}

// ---- articles ----
function articlePage(a) {
  const path = `/en/articles/${a.slug}`;
  const ogImage = `${ORIGIN}/assets/og/article-${a.slug}.jpg`;
  const crumbs = [
    { name: 'DECIDE.', href: '../../?lang=en', path: '/en/' },
    { name: 'Reading', href: './', path: '/en/articles/' },
    { name: a.h1, path },
  ];
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.h1, description: a.description, image: ogImage, inLanguage: 'en',
    mainEntityOfPage: ORIGIN + path, datePublished: a.date, dateModified: a.updated || a.date,
    author: { '@type': 'Organization', name: 'DECIDE.' },
    publisher: { '@type': 'Organization', name: 'DECIDE.', url: ORIGIN + '/' },
  };
  const relWorries = a.worries.map((s) => worryBySlug.get(s)).filter(Boolean);
  const relCards = [...new Set([a.primary, ...a.cards])].map((id) => byId.get(id)).filter(Boolean);
  const others = published.filter((o) => o.slug !== a.slug).slice(0, 5);
  const body = `<main>
${crumbsHtml(crumbs)}
<article>
${a.draft ? '<p class="draft">Draft (unpublished) — this page is for review only.</p>' : ''}
${kick('READING', 'page-k')}
<h1>${esc(a.h1)}</h1>
<p class="dateline"><time datetime="${a.date}">${fmtDate(a.date)}</time>${a.updated ? ` (updated <time datetime="${a.updated}">${fmtDate(a.updated)}</time>)` : ''} · DECIDE. editors</p>
<figure class="art-hero">${picture(byId.get(a.primary), { eager: true, sizes: '(max-width: 600px) 68vw, 300px' })}</figure>
${a.html}
${ctaHtml()}
${relWorries.length ? `<section>
<h2>Related decision guides</h2>
<ul class="cats">${relWorries.map((w) => `<li><a href="../cards/worry-${w.slug}">${esc(w.h1)}</a></li>`).join('')}<li><a href="../cards/worries">All decisions</a></li></ul>
</section>` : ''}
<section>
<h2>Cards related to this article</h2>
<ul class="grid">${relCards.map((c) => `<li><a href="../cards/${c.id}">${picture(c, { sizes: '120px' })}${esc(c.name)}</a></li>`).join('')}</ul>
<p class="note"><a href="../cards/">All 78 tarot card meanings</a></p>
</section>
${others.length ? `<section>
<h2>More reading</h2>
<ul>${others.map((o) => `<li><a href="./${o.slug}">${esc(o.h1)}</a></li>`).join('')}</ul>
<p class="note"><a href="./">All articles</a></p>
</section>` : ''}
</article>
</main>`;
  return layout({ title: a.title, description: a.description, path, ogImage, ld: [ld, crumbsLd(crumbs)], body, noindex: a.draft, css: '.art-hero{margin:22px 0 4px;text-align:center}.art-hero img{width:300px;max-width:68%;height:auto;border-radius:12px;border:5px solid #fff;box-shadow:0 14px 30px rgba(17,17,17,.22)}.art-img{margin:20px 0;text-align:center}.art-img img{width:170px;max-width:55%;height:auto;border-radius:10px;border:4px solid #fff;box-shadow:0 10px 24px rgba(17,17,17,.18)}', next: { base: '../cards/', seeds: a.worries } });
}

function articlesIndex(list) {
  const path = '/en/articles/';
  const title = 'Reading | Articles for Thinking Through a Decision - DECIDE.';
  const description = 'Changing jobs, breaking up, a side business, the tiredness of not being able to decide. Articles for sorting out your thinking about decisions, borrowing the tarot\u2019s viewpoint along the way.';
  const crumbs = [{ name: 'DECIDE.', href: '../../?lang=en', path: '/en/' }, { name: 'Reading', path }];
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'DECIDE. reading',
    itemListElement: list.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/en/articles/${a.slug}`, name: a.h1 })),
  };
  const rows = list.map((a) => `<li><h3><a href="./${a.slug}">${esc(a.h1)}</a>${a.draft ? ' (draft)' : ''}</h3><p class="dateline"><time datetime="${a.date}">${fmtDate(a.date)}</time></p><p>${esc(a.description)}</p></li>`).join('\n');
  const body = `<main>
${crumbsHtml(crumbs)}
${kick('READING', 'page-k')}
<h1>Reading</h1>
<p>Articles for when you are stopped in front of a big decision and want to sort out your thinking. The cards here are not something that tells the future — they are questions that help you notice feelings and conditions you have overlooked.</p>
<ul class="alist">
${rows}
</ul>
<div class="cta"><p>Once you have read the card meanings, turn to your own two options.</p><a href="${CTA_HREF}">${CTA_TEXT}</a></div>
<p class="note"><a href="../cards/worries">Read by decision</a> / <a href="../cards/">All 78 card meanings</a></p>
</main>`;
  return layout({ title, description, path, ogType: 'website', ogImage: `${ORIGIN}/og-image-v3.png`, ld: [itemList, crumbsLd(crumbs)], body, noindex: !list.some((a) => !a.draft) });
}

// ---- generation ----
mkdirSync(DIST + 'en/cards', { recursive: true });
const thin = [];
const worryText = (w) => [w.lead, ...w.sections.flatMap((s) => [s.h2, s.p])].join('');
for (const c of cards) {
  const n = countChars([c.symbol, c.story, c.background, c.upright.meaning, c.reversed.meaning, c.extra.hint, c.extra.scene, c.extra.check].join(''));
  if (n < 800) thin.push({ id: c.id, chars: n });
  writeFileSync(`${DIST}en/cards/${c.id}.html`, cardPage(c));
}
writeFileSync(DIST + 'en/cards/index.html', indexPage());
for (const a of ARCANA_ORDER) writeFileSync(`${DIST}en/cards/${CAT_SLUG[a]}.html`, categoryPage(a));
for (const w of worries) {
  const n = countChars(worryText(w));
  if (n < 800) thin.push({ id: `worry-${w.slug}`, chars: n });
  writeFileSync(`${DIST}en/cards/worry-${w.slug}.html`, worryPage(w));
}
writeFileSync(DIST + 'en/cards/worries.html', worriesIndex());

rmSync(DIST + 'en/articles', { recursive: true, force: true });
if (articles.length) {
  mkdirSync(DIST + 'en/articles', { recursive: true });
  for (const a of articles) {
    if (countChars(a.text) < 1500) thin.push({ id: `article-${a.slug}`, chars: countChars(a.text) });
    writeFileSync(`${DIST}en/articles/${a.slug}.html`, articlePage(a));
  }
  writeFileSync(DIST + 'en/articles/index.html', articlesIndex(articles));
}

// ---- sitemap merge (existing entries preserved verbatim; /en/ entries replaced) ----
const enUrls = [
  ['/en/', '0.8'], ['/en/about', '0.5'], ['/en/cards/', '0.8'],
  ...ARCANA_ORDER.map((a) => [`/en/cards/${CAT_SLUG[a]}`, '0.7']),
  ['/en/cards/worries', '0.7'],
  ...worries.map((w) => [`/en/cards/worry-${w.slug}`, '0.7']),
  ...cards.map((c) => [`/en/cards/${c.id}`, '0.6']),
  ...(published.length ? [['/en/articles/', '0.7'], ...published.map((a) => [`/en/articles/${a.slug}`, '0.6'])] : []),
];
const smPath = DIST + 'sitemap.xml';
if (existsSync(smPath)) {
  let sm = readFileSync(smPath, 'utf8');
  sm = sm.split('\n').filter((line) => !line.includes(`<loc>${ORIGIN}/en/`)).join('\n');
  const entries = enUrls.map(([p, pr]) => `  <url><loc>${ORIGIN}${p}</loc><lastmod>${TODAY}</lastmod><priority>${pr}</priority></url>`).join('\n');
  if (!sm.includes('</urlset>')) throw new Error('sitemap.xml has no </urlset>');
  sm = sm.replace('</urlset>', entries + '\n</urlset>');
  writeFileSync(smPath, sm);
  console.log(`sitemap: merged ${enUrls.length} English URLs`);
} else {
  console.log('sitemap: dist/sitemap.xml not found — run build-cards.mjs first; English URLs not merged');
}

console.log(`en pages: ${cards.length} cards + index + ${ARCANA_ORDER.length} categories + ${worries.length} worries + worries index + ${published.length} articles + articles index`);
if (thin.length) console.log(`note: short English texts (< threshold, not failing): ${thin.map((t) => `${t.id}:${t.chars}`).join(', ')}`);

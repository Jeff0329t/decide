#!/usr/bin/env node
// Phase 4: SEO 用カード解説ページ（静的・JS 不要・ログイン不要）を生成する。
// 入力: dist/assets/cards.json + scripts/data/cards-extra-*.json
// 出力: dist/cards/index.html, dist/cards/{major,wands,cups,swords,pentacles}.html,
//       dist/cards/{id}.html, dist/cards/worries.html, dist/cards/worry-{slug}.html,
//       dist/articles/index.html, dist/articles/{slug}.html（記事が1本以上あるとき）,
//       dist/sitemap.xml, dist/robots.txt
// 悩み別ページの文章: scripts/data/worries.json / 記事: scripts/data/articles/*.md
// 使い方: node scripts/build-cards.mjs [--drafts]
//   --drafts: draft: true の記事も noindex 付きで出力する（確認用。sitemap には入れない）
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadArticles } from './lib/markdown.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const ORIGIN = 'https://decisionprocess.net';
const MIN_CHARS = 800;
const CTA_TEXT = '今抱えている迷いを、このカードの視点から考えてみる';
const CREDIT = 'images: sixseeds/tarot-api, public domain';
const TODAY = new Date().toISOString().slice(0, 10);
const DRAFTS = process.argv.includes('--drafts');
const ARTICLE_MIN_CHARS = 1500;

const deck = JSON.parse(readFileSync(DIST + 'assets/cards.json', 'utf8'));
const extra = {};
for (const f of ['major', 'wands', 'cups', 'swords', 'pentacles']) {
  Object.assign(extra, JSON.parse(readFileSync(`${DATA}cards-extra-${f}.json`, 'utf8')));
}

const cards = deck.cards;
const byId = new Map(cards.map((c) => [c.id, c]));
const worries = JSON.parse(readFileSync(DATA + 'worries.json', 'utf8'));
for (const w of worries) {
  if (!/^[a-z]+$/.test(w.slug)) throw new Error(`bad worry slug: ${w.slug}`);
  for (const id of [w.primary, ...w.cards.map((x) => x.id)]) {
    if (!byId.has(id)) throw new Error(`unknown card in worry ${w.slug}: ${id}`);
  }
}
const articles = loadArticles(DATA + 'articles/', { drafts: DRAFTS, worrySlugs: worries.map((w) => w.slug), cardIds: cards.map((c) => c.id) });
const published = articles.filter((a) => !a.draft);
const worryBySlug = new Map(worries.map((w) => [w.slug, w]));
const worryText = (w) => [w.lead, ...w.sections.flatMap((s) => [s.h2, s.p])].join('');
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

const CATEGORY = {
  大アルカナ: {
    slug: 'major', label: '大アルカナ',
    intro: '大アルカナは「愚者」から「世界」までの22枚で、タロットの物語の骨格にあたるカードです。旅立ち、学び、試練、喪失、再生、完成という人生の大きな流れが、一枚ずつ象徴として描かれています。日々の出来事よりも、価値観や生き方の向きそのものに関わる問いを映しやすいのが特徴です。決断の場面で大アルカナが出たときは、目の前の損得だけでなく「この選択は自分がどんな人でありたいかとつながっているか」を考える手がかりになります。番号順に読むと、ひとつの成長の物語として前後のカードの意味もつながって見えてきます。0番の「愚者」は何も持たずに一歩を踏み出す存在で、残りの21枚はその旅で出会う人物や出来事、心の状態だと考えると覚えやすくなります。迷いが深いときほど、一枚の意味だけでなく流れの中での位置を見てみてください。',
  },
  ワンド: {
    slug: 'wands', label: 'ワンド',
    intro: 'ワンド（棒）は火のエレメントに対応し、情熱・意欲・行動・挑戦を司るスートです。エースからテンまでの数札は、ひらめきが生まれ、計画を立て、競い合い、成果を得て、やがて重荷を抱えるまでの流れを描きます。ペイジ・ナイト・クイーン・キングの人物札は、その熱量をどう扱う人なのかを表します。決断の場面でワンドが出たときは、「本当にやりたいのはどちらか」「勢いと準備のバランスは取れているか」を確かめる視点として読むと役立ちます。気持ちが先走りやすい選択や、新しい挑戦を前にしたときに特に参考になるスートです。同じワンドでも、数が小さいほど始まりの勢いを、大きいほど抱え込んだ責任を表す傾向があります。いま自分の熱意がどの段階にあるのかを照らし合わせながら読んでみてください。',
  },
  カップ: {
    slug: 'cups', label: 'カップ',
    intro: 'カップ（聖杯）は水のエレメントに対応し、感情・人間関係・愛情・心の満足を司るスートです。エースからテンまでの数札は、気持ちが満ちあふれ、誰かと分かち合い、失望や迷いを経て、心からの充足へ向かう流れを描きます。人物札は、感受性や共感力をどう使う人なのかを表します。決断の場面でカップが出たときは、条件や合理性だけでは見えにくい「自分は本当はどう感じているか」「大切な人との関係はどうなるか」に目を向けるきっかけになります。頭では決めているのに心が追いつかない、そんな迷いを整理するときに頼りになるスートです。数が小さいほど気持ちの芽生えを、大きいほど成熟した満足や関係の完成を表す傾向があります。いま自分の心がどの段階にあるのかを確かめながら読んでみてください。',
  },
  ソード: {
    slug: 'swords', label: 'ソード',
    intro: 'ソード（剣）は風のエレメントに対応し、思考・判断・言葉・対立を司るスートです。エースからテンまでの数札には、明晰なひらめきから始まり、迷い、心の痛み、駆け引き、不安、そして区切りと再出発までが描かれ、厳しい絵柄が多いのも特徴です。人物札は、知性や言葉をどう使う人なのかを表します。決断の場面でソードが出たときは、「事実と思い込みを分けられているか」「怖れが判断を曇らせていないか」を点検する視点として読むと役立ちます。つらい状況を直視し、考えを研ぎ澄ませて線を引く必要がある選択で、特に力を発揮するスートです。厳しい絵柄でも、それは「危険を知らせ、考え直す機会をくれる」サインとして読めます。数の流れの中で、いまの思考がどの段階にあるのかを照らし合わせてみてください。',
  },
  ペンタクル: {
    slug: 'pentacles', label: 'ペンタクル',
    intro: 'ペンタクル（金貨）は地のエレメントに対応し、お金・仕事・技術・健康・暮らしの土台を司るスートです。エースからテンまでの数札は、小さな機会をつかみ、工夫と努力を重ね、蓄えと成果を得て、次の世代へ受け継ぐまでの着実な流れを描きます。人物札は、現実的な力をどう育て、どう使う人なのかを表します。決断の場面でペンタクルが出たときは、「時間とお金の見通しは立っているか」「長く続けられる形になっているか」を確かめる視点として読むと役立ちます。転職や引っ越し、買い物など、生活に直結する選択で特に参考になるスートです。数が小さいほど種まきの段階を、大きいほど実りや継承の段階を表す傾向があります。焦らず積み上げることの価値を思い出させてくれるカードが多いのも特徴です。',
  },
};
const catOf = (c) => CATEGORY[c.arcana];

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

// 正位置の「進めやすさ」が同じカード（デッキ順で近いものから最大4枚、関連カードと重複しない）
function sameScore(c, exclude) {
  const skip = new Set([c.id, ...exclude.map((r) => r.id)]);
  const i = cards.indexOf(c);
  return cards
    .filter((o) => o.upright.score === c.upright.score && !skip.has(o.id))
    .sort((a, b) => Math.abs(cards.indexOf(a) - i) - Math.abs(cards.indexOf(b) - i))
    .slice(0, 4);
}

const gridHtml = (list) => `<ul class="grid">${list.map((r) => `<li><a href="./${r.id}.html">${picture(r, { sizes: '120px' })}${esc(r.name)}</a></li>`).join('')}</ul>`;

const imgBase = (id) => `../assets/rider-waite/${id}`;
const altOf = (c) => `${c.name}（${c.en}）のカード画像。ライダー版タロット`;

function picture(c, { eager = false, sizes = '(max-width: 600px) 60vw, 280px', w = 300, h = 520 } = {}) {
  const b = imgBase(c.id);
  return `<picture><source type="image/webp" srcset="${b}-320.webp 320w, ${b}-480.webp 480w" sizes="${sizes}"><img src="${b}.jpg" alt="${esc(altOf(c))}" width="${w}" height="${h}"${eager ? '' : ' loading="lazy"'} decoding="async"></picture>`;
}

const CSS = `:root{--ink:#1e2430;--soft:#f2efe7;--muted:#5b6270;--line:#d9d4c7;--card:#fffdf8;--accent:#f1d625}
*{box-sizing:border-box}
body{margin:0;background:var(--soft);color:var(--ink);font-family:Inter,"Hiragino Sans","Yu Gothic UI","Yu Gothic",sans-serif;font-size:16.5px;line-height:1.9;-webkit-text-size-adjust:100%}
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
.pager{display:flex;justify-content:space-between;gap:12px;margin:28px 0 0;padding:0;list-style:none;font-size:.88rem}
.pager li{flex:1}
.pager li.next{text-align:right}
.pager a{display:block;padding:10px 12px;border:1.5px solid var(--line);border-radius:6px;text-decoration:none;background:var(--card)}
.pager small{display:block;color:var(--muted);font-size:.75rem}
.wcards{margin:12px 0 0;padding:0;list-style:none}
.wcards li{display:grid;grid-template-columns:72px 1fr;gap:14px;align-items:start;padding:12px 0;border-bottom:1px dashed var(--line)}
.wcards img{width:100%;height:auto;display:block;border:1.5px solid #111;border-radius:4px;background:#111}
.wcards h3{margin:0 0 4px}
.wcards p{margin:0 0 4px}
.cats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none;font-size:.88rem}
.cats a{display:inline-block;padding:2px 12px;border:1.5px solid var(--line);border-radius:999px;text-decoration:none}
.dateline{font-size:.82rem;color:var(--muted);margin:0 0 16px}
.draft{margin:0 0 16px;padding:8px 12px;border:2px dashed #d8402f;color:#d8402f;font-weight:700;font-size:.85rem}
blockquote{margin:16px 0;padding:4px 16px;border-left:3px solid var(--accent);color:var(--muted)}
.alist{margin:12px 0 0;padding:0;list-style:none}
.alist li{padding:12px 0;border-bottom:1px dashed var(--line)}
.alist h3{margin:0 0 4px}
.alist p{margin:0}
.cats [aria-current]{border:1.5px solid #111;background:var(--accent);color:#111;padding:2px 12px;border-radius:999px;font-weight:600}
footer{max-width:720px;margin:0 auto;padding:16px 16px 48px;border-top:1px solid var(--line);font-size:.8rem;color:var(--muted)}
footer p{margin:4px 0}
.topbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px}
.back{display:inline-flex;align-items:center;gap:6px;flex:none;padding:6px 14px 6px 10px;border:1.5px solid #111;border-radius:999px;background:var(--card);color:#111;font-size:.85rem;font-weight:700;text-decoration:none;box-shadow:2px 2px 0 #111;line-height:1.4}
.back:active{transform:translate(1px,1px);box-shadow:1px 1px 0 #111}
.topbar .crumbs{flex:1;min-width:0}
main p{margin:0 0 1em}
.lede{font-size:1.02rem}
.steps{counter-reset:s;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:12px 0 0;padding:0;list-style:none}
.steps li{position:relative;padding:14px 14px 12px 52px;background:var(--card);border:1.5px solid var(--line);border-radius:10px;font-size:.92rem;line-height:1.7}
.steps li::before{counter-increment:s;content:counter(s);position:absolute;left:14px;top:14px;width:26px;height:26px;border-radius:50%;background:var(--accent);border:1.5px solid #111;color:#111;font-weight:800;font-size:.85rem;display:flex;align-items:center;justify-content:center}
.steps b{display:block;margin-bottom:2px}
.wjump{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:0;list-style:none}
.wjump a{display:inline-block;padding:4px 14px;border:1.5px solid #111;border-radius:999px;background:var(--card);text-decoration:none;font-size:.85rem;font-weight:600}
.wgroup-lead{color:var(--muted);font-size:.92rem;margin:0 0 4px}
.wtiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:12px 0 0;padding:0;list-style:none}
.wtile{display:flex;flex-direction:column;background:var(--card);border:1.5px solid #111;border-radius:12px;box-shadow:3px 3px 0 #111;overflow:hidden}
.wtile-head{display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:center;padding:14px 14px 10px;text-decoration:none}
.wtile-head img{width:100%;height:auto;display:block;border:1.5px solid #111;border-radius:4px;background:#111}
.wtile-head h3{margin:0;font-size:1.05rem;line-height:1.45}
.wtile-head small{display:block;color:var(--muted);font-size:.78rem;font-weight:400;margin-top:2px}
.wtile-body{padding:0 14px 12px;font-size:.9rem;line-height:1.75;flex:1}
.wtile-body p{margin:0 0 8px}
.wtile-q{margin:0;padding:8px 12px;background:var(--soft);border-radius:8px;font-size:.86rem}
.wtile-cards{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0;padding:0;list-style:none}
.wtile-cards a{display:inline-block;padding:1px 10px;border:1px solid var(--line);border-radius:999px;font-size:.78rem;text-decoration:none;background:var(--soft)}
.wtile-more{display:block;padding:10px 14px;border-top:1.5px solid #111;background:var(--accent);color:#111;font-weight:700;font-size:.88rem;text-decoration:none;text-align:right}`;

function layout({ title, description, path, ogImage, ogType = 'article', ld, body, noindex = false }) {
  const url = ORIGIN + path;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">${noindex ? '\n<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#f2efe7">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="DECIDE">
<meta property="og:locale" content="ja_JP">
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
  const parent = [...items.slice(0, -1)].reverse().find((it) => it.href);
  const back = parent ? `<a class="back" href="${parent.href}" aria-label="${esc(parent.name)}に戻る">← 戻る</a>` : '';
  return `<div class="topbar">${back}<nav class="crumbs" aria-label="パンくずリスト"><ol>${items.map((it, i) =>
    i === items.length - 1 ? `<li aria-current="page">${esc(it.name)}</li>` : `<li><a href="${it.href}">${esc(it.name)}</a></li>`
  ).join('')}</ol></nav></div>`;
}
const crumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: ORIGIN + it.path })),
});

const ctaHtml = (c, where) => `<aside class="cta" aria-label="DECIDE で考える">
<p>${where === 'mid' ? `${esc(c.name)}が示す視点を、あなた自身の選択肢に当てはめてみませんか。` : '二つの選択肢を並べて、カードと一緒に整理できます。'}</p>
<a href="../?from=${c.id}">${CTA_TEXT}</a>
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
  const ogImage = `${ORIGIN}/assets/og/${c.id}.jpg`;
  const crumbs = [
    { name: 'DECIDE', href: '../', path: '/' },
    { name: 'カード解説', href: './', path: '/cards/' },
    { name: catOf(c).label, href: `./${catOf(c).slug}.html`, path: `/cards/${catOf(c).slug}.html` },
    { name: c.name, path },
  ];
  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: `${c.name}（${c.en}）の意味と決断のヒント`,
    description, image: `${ORIGIN}/assets/rider-waite/${c.id}.jpg`, inLanguage: 'ja',
    mainEntityOfPage: ORIGIN + path, datePublished: TODAY, dateModified: TODAY,
    author: { '@type': 'Organization', name: 'DECIDE' },
    publisher: { '@type': 'Organization', name: 'DECIDE', url: ORIGIN + '/' },
  };
  const rel = related(c);
  const same = sameScore(c, rel);
  const idx = cards.indexOf(c);
  const prev = cards[idx - 1];
  const next = cards[idx + 1];
  const cat = catOf(c);
  const body = `<main>
${crumbsHtml(crumbs)}
<article>
<h1>${esc(c.name)}の意味</h1>
<p class="en serif">${esc(c.en)}</p>
<div class="hero">
${picture(c, { eager: true })}
<div>
<ul class="facts">
<li><b>分類</b><a href="./${cat.slug}.html">${esc(c.arcana)}</a></li>
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
${gridHtml(rel)}
${same.length ? `<h3>正位置の${esc(deck.scoring.axis)}が同じ（${c.upright.score} / 5）カード</h3>
${gridHtml(same)}` : ''}
<p class="note"><a href="./${cat.slug}.html">${esc(cat.label)}のカード一覧（${cards.filter((o) => o.arcana === c.arcana).length}枚）</a> ／ <a href="./">78枚すべてのカード解説を見る</a></p>
<nav aria-label="前後のカード"><ul class="pager">
<li class="prev">${prev ? `<a href="./${prev.id}.html" rel="prev"><small>← 前のカード</small>${esc(prev.name)}</a>` : ''}</li>
<li class="next">${next ? `<a href="./${next.id}.html" rel="next"><small>次のカード →</small>${esc(next.name)}</a>` : ''}</li>
</ul></nav>
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
<h2 id="${a === '大アルカナ' ? 'major' : SUIT_PREFIX[a]}"><a href="./${CATEGORY[a].slug}.html">${esc(a)}（${list.length}枚）</a></h2>
<p class="note">${esc(SUIT_NOTE[a])} <a href="./${CATEGORY[a].slug}.html">${esc(a)}の解説を読む</a></p>
${gridHtml(list)}
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
<section>
<h2 id="worries"><a href="./worries.html">悩み別に読む</a></h2>
<p class="note">転職・別れ・引っ越しなど、よくある迷いごとに考え方と関係するカードをまとめています。</p>
${worriesNav()}
</section>
${published.length ? `<section>
<h2 id="articles"><a href="../articles/">読みもの</a></h2>
<p class="note">迷いや決断について、もう少し踏み込んで考えるための記事です。</p>
<ul class="cats">${published.slice(0, 5).map((a) => `<li><a href="../articles/${a.slug}.html">${esc(a.h1)}</a></li>`).join('')}<li><a href="../articles/">記事の一覧</a></li></ul>
</section>` : ''}
${groups}
</main>`;
  return layout({
    title, description, path, ogType: 'website', ogImage: `${ORIGIN}/og-image-v3.png`,
    ld: [itemList, crumbsLd(crumbs)], body,
  });
}

function catsNav(current) {
  return `<ul class="cats" aria-label="カテゴリ">${ARCANA_ORDER.map((a) => a === current
    ? `<li aria-current="page">${esc(a)}</li>`
    : `<li><a href="./${CATEGORY[a].slug}.html">${esc(a)}</a></li>`).join('')}<li><a href="./">78枚すべて</a></li></ul>`;
}

function categoryPage(a) {
  const cat = CATEGORY[a];
  const list = cards.filter((c) => c.arcana === a);
  const path = `/cards/${cat.slug}.html`;
  const title = a === '大アルカナ'
    ? `大アルカナ${list.length}枚の意味一覧｜正位置・逆位置と決断のヒント - DECIDE`
    : `${a}（${list.length}枚）の意味一覧｜タロット小アルカナと決断のヒント - DECIDE`;
  const description = `${SUIT_NOTE[a]}タロット「${a}」${list.length}枚それぞれの正位置・逆位置のキーワードと、迷いや決断の場面での読み方をまとめました。`.slice(0, 160);
  const crumbs = [
    { name: 'DECIDE', href: '../', path: '/' },
    { name: 'カード解説', href: './', path: '/cards/' },
    { name: a, path },
  ];
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: `${a}のカード解説`,
    itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/cards/${c.id}.html`, name: c.name })),
  };
  const rows = list.map((c) => `<li><a href="./${c.id}.html"><b>${esc(c.name)}</b></a>：正位置「${esc(c.upright.keywords.join('・'))}」／逆位置「${esc(c.reversed.keywords.join('・'))}」</li>`).join('\n');
  const body = `<main>
${crumbsHtml(crumbs)}
<h1>${esc(a)}の意味一覧（${list.length}枚）</h1>
${catsNav(a)}
<p>${esc(cat.intro)}</p>
${gridHtml(list)}
<div class="cta"><p>${esc(a)}の視点を、いまの選択肢に当てはめてみる</p><a href="../?from=${cat.slug}">${CTA_TEXT}</a></div>
<section>
<h2>${esc(a)}のキーワード早見表</h2>
<ul>
${rows}
</ul>
</section>
<p class="note"><a href="./">78枚すべてのカード解説を見る</a></p>
</main>`;
  return layout({ title, description, path, ogType: 'website', ogImage: `${ORIGIN}/assets/rider-waite/${list[0].id}.jpg`, ld: [itemList, crumbsLd(crumbs)], body });
}

function worriesNav(current) {
  return `<ul class="cats" aria-label="悩み別">${worries.map((w) => w.slug === current
    ? `<li aria-current="page">${esc(w.h1)}</li>`
    : `<li><a href="./worry-${w.slug}.html">${esc(w.h1)}</a></li>`).join('')}<li><a href="./worries.html">悩み別の一覧</a></li></ul>`;
}

function worryPage(w) {
  const path = `/cards/worry-${w.slug}.html`;
  const primary = byId.get(w.primary);
  const ogImage = `${ORIGIN}/assets/og/worry-${w.slug}.jpg`;
  const crumbs = [
    { name: 'DECIDE', href: '../', path: '/' },
    { name: 'カード解説', href: './', path: '/cards/' },
    { name: '悩み別に読む', href: './worries.html', path: '/cards/worries.html' },
    { name: w.h1, path },
  ];
  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: w.h1, description: w.description, image: `${ORIGIN}/assets/rider-waite/${w.primary}.jpg`, inLanguage: 'ja',
    mainEntityOfPage: ORIGIN + path, datePublished: TODAY, dateModified: TODAY,
    author: { '@type': 'Organization', name: 'DECIDE' },
    publisher: { '@type': 'Organization', name: 'DECIDE', url: ORIGIN + '/' },
  };
  const cta = (msg) => `<aside class="cta" aria-label="DECIDE で考える">
<p>${msg}</p>
<a href="../?from=${w.primary}">${CTA_TEXT}</a>
</aside>`;
  const cardRows = w.cards.map(({ id, reason }) => {
    const c = byId.get(id);
    return `<li><a href="./${id}.html">${picture(c, { sizes: '96px' })}</a><div><h3><a href="./${id}.html">${esc(c.name)}</a></h3><p>${esc(reason)}</p></div></li>`;
  }).join('\n');
  const body = `<main>
${crumbsHtml(crumbs)}
<article>
<h1>${esc(w.h1)}</h1>
<p>${esc(w.lead)}</p>
${cta(`${esc(primary.name)}の視点から、あなた自身の二つの選択肢を並べてみませんか。`)}
${w.sections.map((s) => `<section>
<h2>${esc(s.h2)}</h2>
<p>${esc(s.p)}</p>
</section>`).join('\n')}
<section>
<h2>この悩みに関係するカード</h2>
<ul class="wcards">
${cardRows}
</ul>
</section>
${cta('二つの選択肢を並べて、カードと一緒に整理できます。')}
<section>
<h2>ほかの悩みから読む</h2>
${worriesNav(w.slug)}
<p class="note"><a href="./">78枚すべてのカード解説を見る</a></p>
</section>
</article>
</main>`;
  return layout({ title: w.title, description: w.description, path, ogImage, ld: [article, crumbsLd(crumbs)], body });
}

const WORRIES_INTRO = [
  '大きな決断ほど、ひとりで考えていると同じところをぐるぐる回ってしまいがちです。転職、就活、副業、独立、学び直し、お金の使い方、恋愛、結婚、別れ、介護、引っ越し、人間関係。どれも正解がひとつに決まらず、どちらを選んでも何かを手放すことになる種類の迷いです。',
  'このページでは、よくある迷いごとに「何が判断を難しくしているのか」「どんな順番で考えると整理しやすいか」をまとめ、その場面で視点を貸してくれるタロットカードを紹介しています。カードは未来を言い当てるためのものではなく、見落としていた気持ちや条件に気づくための問いかけとして使ってください。',
  '各ページでは、迷いの中身を分解する考え方を四つの観点から説明したうえで、関係するカードがなぜその場面で役立つのかを一枚ずつ解説しています。気になるテーマから読み始め、最後にDECIDEで実際の二つの選択肢を並べてみると、頭の中だけで考えていたときよりも、自分が本当に大切にしたいものが見えやすくなるはずです。',
];

const WORRY_GROUPS = [
  { id: 'work', name: '仕事・キャリア', lead: '働き方や収入にかかわる迷い。条件の比較だけでは決めきれないときに。', slugs: ['tenshoku', 'shukatsu', 'fukugyo', 'dokuritsu', 'manabi'] },
  { id: 'love', name: '恋愛・家族', lead: '大切な人との関係にかかわる迷い。気持ちと現実のあいだで揺れるときに。', slugs: ['renai', 'kekkon', 'wakare', 'kaigo'] },
  { id: 'life', name: '暮らし・お金・人づきあい', lead: '毎日の土台にかかわる迷い。小さく見えて、あとから効いてくる選択に。', slugs: ['hikkoshi', 'okane', 'ningen'] },
];

function firstSentence(text) {
  const i = text.indexOf('。');
  return i === -1 ? text : text.slice(0, i + 1);
}

// 「自分への問いかけ」は導入文で始まるため、最初の実際の問い（「か。」で終わる文）を拾う
function firstQuestion(text) {
  const q = text.match(/[^。]*?か。/);
  return q ? q[0].trim().replace(/か。$/, 'か？') : firstSentence(text);
}

function worriesIndex() {
  const path = '/cards/worries.html';
  const title = '悩み別に読むタロット｜転職・恋愛・引っ越しなど決断の考え方 - DECIDE';
  const description = `転職、就活、副業、恋愛、結婚、別れ、介護、引っ越し、お金など、よくある${worries.length}の迷いについて、考え方の整理のしかたと視点を貸してくれるタロットカードを紹介します。`;
  const crumbs = [
    { name: 'DECIDE', href: '../', path: '/' },
    { name: 'カード解説', href: './', path: '/cards/' },
    { name: '悩み別に読む', path },
  ];
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: '悩み別のタロット解説',
    itemListElement: worries.map((w, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/cards/worry-${w.slug}.html`, name: w.h1 })),
  };
  const bySlug = new Map(worries.map((w) => [w.slug, w]));
  const grouped = new Set(WORRY_GROUPS.flatMap((g) => g.slugs));
  const groups = WORRY_GROUPS.map((g) => ({ ...g, items: g.slugs.map((x) => bySlug.get(x)).filter(Boolean) }));
  const rest = worries.filter((w) => !grouped.has(w.slug));
  if (rest.length) groups.push({ id: 'other', name: 'そのほかの迷い', lead: '', items: rest });
  const tile = (w) => {
    const c = byId.get(w.primary);
    const ask = w.sections.find((x) => x.h2 === '自分への問いかけ');
    return `<li class="wtile"><a class="wtile-head" href="./worry-${w.slug}.html">${picture(c, { sizes: '64px' })}<h3>${esc(w.h1)}<small>鍵になるカード：${esc(c.name)}</small></h3></a>
<div class="wtile-body"><p>${esc(w.description)}</p>${ask ? `<p class="wtile-q">${esc(firstQuestion(ask.p))}</p>` : ''}
<ul class="wtile-cards" aria-label="関係するカード">${w.cards.map((x) => `<li><a href="./${x.id}.html">${esc(byId.get(x.id).name)}</a></li>`).join('')}</ul></div>
<a class="wtile-more" href="./worry-${w.slug}.html" aria-label="${esc(w.h1)}を読む">考え方を読む →</a></li>`;
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
<h1>悩み別に読むタロット</h1>
${WORRIES_INTRO.map((p, i) => `<p${i === 0 ? ' class="lede"' : ''}>${esc(p)}</p>`).join('\n')}
<h2>このページの使い方</h2>
<ol class="steps">
<li><b>近いテーマを選ぶ</b>いまの迷いにいちばん近いものを開きます。ぴったりでなくても大丈夫です。</li>
<li><b>迷いをほどく</b>「迷いの正体」と「整理の視点」で、何に引っかかっているのかを言葉にします。</li>
<li><b>カードの視点を借りる</b>関係するカードの意味を読み、見落としていた気持ちや条件を探します。</li>
<li><b>実際に引いてみる</b>二つの選択肢を思い浮かべて、DECIDEでカードを引きます。</li>
</ol>
<nav aria-label="テーマから探す"><ul class="wjump">
${worries.map((w) => `<li><a href="./worry-${w.slug}.html">${esc(w.h1.replace(/(で|を|に)?(迷う|決められない|踏み切れない|始めるか迷う)とき$/, '').replace(/するか$/, '').replace(/るか$/, 'る'))}</a></li>`).join('\n')}
</ul></nav>
${sections}
<div class="cta"><p>カードを引いて、いまの迷いを整理する</p><a href="../">${CTA_TEXT}</a></div>
<p class="note"><a href="./">78枚すべてのカード解説を見る</a></p>
</main>`;
  return layout({ title, description, path, ogType: 'website', ogImage: `${ORIGIN}/og-image-v3.png`, ld: [itemList, crumbsLd(crumbs)], body });
}

// ---- 記事 ----
const fmtDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${y}年${m}月${dd}日`; };

function articlePage(a) {
  const path = `/articles/${a.slug}.html`;
  const primary = byId.get(a.primary);
  const ogImage = `${ORIGIN}/assets/og/article-${a.slug}.jpg`;
  const crumbs = [
    { name: 'DECIDE', href: '../', path: '/' },
    { name: '読みもの', href: './', path: '/articles/' },
    { name: a.h1, path },
  ];
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.h1, description: a.description, image: ogImage, inLanguage: 'ja',
    mainEntityOfPage: ORIGIN + path, datePublished: a.date, dateModified: a.updated || a.date,
    author: { '@type': 'Organization', name: 'DECIDE' },
    publisher: { '@type': 'Organization', name: 'DECIDE', url: ORIGIN + '/' },
  };
  const cta = (msg) => `<aside class="cta" aria-label="DECIDE で考える">
<p>${msg}</p>
<a href="../?from=${a.primary}">${CTA_TEXT}</a>
</aside>`;
  // 中間CTA: 真ん中あたりの h2 の直前（h2 が2つ未満なら本文の後ろの CTA だけ）
  const h2s = a.blocks.map((b, i) => (b.type === 'h2' ? i : -1)).filter((i) => i >= 0);
  const midAt = h2s.length >= 2 ? h2s[Math.floor(h2s.length / 2)] : -1;
  const mid = cta(`${esc(primary.name)}の視点から、あなた自身の二つの選択肢を並べてみませんか。`);
  const bodyHtml = a.blocks.map((b, i) => (i === midAt ? mid + '\n' : '') + b.html).join('\n');
  const relWorries = a.worries.map((s) => worryBySlug.get(s));
  const relCards = [...new Set([a.primary, ...a.cards])].map((id) => byId.get(id));
  const others = published.filter((o) => o.slug !== a.slug).slice(0, 5);
  const body = `<main>
${crumbsHtml(crumbs)}
<article>
${a.draft ? '<p class="draft">下書き（未公開）— このページは確認用です。公開するには draft: false にして再ビルドします。</p>' : ''}
<h1>${esc(a.h1)}</h1>
<p class="dateline"><time datetime="${a.date}">${fmtDate(a.date)}</time>${a.updated ? `（更新 <time datetime="${a.updated}">${fmtDate(a.updated)}</time>）` : ''} ・ DECIDE 編集部</p>
${bodyHtml}
${cta('二つの選択肢を並べて、カードと一緒に整理できます。')}
${relWorries.length ? `<section>
<h2>関係する悩み別ガイド</h2>
<ul class="cats">${relWorries.map((w) => `<li><a href="../cards/worry-${w.slug}.html">${esc(w.h1)}</a></li>`).join('')}<li><a href="../cards/worries.html">悩み別の一覧</a></li></ul>
</section>` : ''}
<section>
<h2>この記事に関係するカード</h2>
<ul class="grid">${relCards.map((c) => `<li><a href="../cards/${c.id}.html">${picture(c, { sizes: '120px' })}${esc(c.name)}</a></li>`).join('')}</ul>
<p class="note"><a href="../cards/">78枚すべてのカード解説を見る</a></p>
</section>
${others.length ? `<section>
<h2>ほかの読みもの</h2>
<ul>${others.map((o) => `<li><a href="./${o.slug}.html">${esc(o.h1)}</a></li>`).join('')}</ul>
<p class="note"><a href="./">記事の一覧</a></p>
</section>` : ''}
</article>
</main>`;
  return layout({ title: a.title, description: a.description, path, ogImage, ld: [ld, crumbsLd(crumbs)], body, noindex: a.draft });
}

function articlesIndex(list) {
  const path = '/articles/';
  const title = '読みもの｜迷いと決断について考える記事 - DECIDE';
  const description = '転職、別れ、副業、決められない疲れ。迷いや決断について、タロットの視点も借りながら考えを整理するための記事をまとめています。';
  const crumbs = [{ name: 'DECIDE', href: '../', path: '/' }, { name: '読みもの', path }];
  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'DECIDE の読みもの',
    itemListElement: list.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/articles/${a.slug}.html`, name: a.h1 })),
  };
  const rows = list.map((a) => `<li><h3><a href="./${a.slug}.html">${esc(a.h1)}</a>${a.draft ? '（下書き）' : ''}</h3><p class="dateline"><time datetime="${a.date}">${fmtDate(a.date)}</time></p><p>${esc(a.description)}</p></li>`).join('\n');
  const body = `<main>
${crumbsHtml(crumbs)}
<h1>読みもの</h1>
<p>大きな決断の前で立ち止まったときに、考えを整理するための記事です。カードは未来を言い当てるものではなく、見落としていた気持ちや条件に気づくための問いかけとして紹介しています。</p>
<ul class="alist">
${rows}
</ul>
<div class="cta"><p>カードを引いて、いまの迷いを整理する</p><a href="../">${CTA_TEXT}</a></div>
<p class="note"><a href="../cards/worries.html">悩み別に読む</a> ／ <a href="../cards/">78枚のカード解説</a></p>
</main>`;
  return layout({ title, description, path, ogType: 'website', ogImage: `${ORIGIN}/og-image-v3.png`, ld: [itemList, crumbsLd(crumbs)], body, noindex: !list.some((a) => !a.draft) });
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
for (const a of ARCANA_ORDER) {
  const n = countChars(CATEGORY[a].intro);
  if (n < 300) throw new Error(`category intro too short: ${a} (${n})`);
  writeFileSync(`${DIST}cards/${CATEGORY[a].slug}.html`, categoryPage(a));
}
for (const w of worries) {
  const n = countChars(worryText(w));
  if (n < MIN_CHARS) thin.push({ id: `worry-${w.slug}`, name: w.h1, chars: n });
  writeFileSync(`${DIST}cards/worry-${w.slug}.html`, worryPage(w));
}
{
  const n = countChars(WORRIES_INTRO.join('') + worries.map((w) => w.description).join(''));
  if (n < MIN_CHARS) thin.push({ id: 'worries', name: '悩み別一覧', chars: n });
  writeFileSync(DIST + 'cards/worries.html', worriesIndex());
}

rmSync(DIST + 'articles', { recursive: true, force: true });
if (articles.length) {
  mkdirSync(DIST + 'articles', { recursive: true });
  for (const a of articles) {
    const n = countChars(a.text);
    if (n < ARTICLE_MIN_CHARS) thin.push({ id: `article-${a.slug}`, name: a.h1, chars: n });
    writeFileSync(`${DIST}articles/${a.slug}.html`, articlePage(a));
  }
  writeFileSync(DIST + 'articles/index.html', articlesIndex(articles));
}

const urls = [
  ['/', '1.0'], ['/cards/', '0.8'],
  ...ARCANA_ORDER.map((a) => [`/cards/${CATEGORY[a].slug}.html`, '0.7']),
  ['/cards/worries.html', '0.7'],
  ...worries.map((w) => [`/cards/worry-${w.slug}.html`, '0.7']),
  ...cards.map((c) => [`/cards/${c.id}.html`, '0.6']),
  ...(published.length ? [['/articles/', '0.7'], ...published.map((a) => [`/articles/${a.slug}.html`, '0.6'])] : []),
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
console.log(`cards: ${cards.length} pages + index + ${ARCANA_ORDER.length} categories + ${worries.length} worries + worries index, sitemap ${urls.length} URLs`);
const wcounts = worries.map((w) => countChars(worryText(w)));
console.log(`articles: ${published.length} published${DRAFTS ? ` + ${articles.length - published.length} drafts (noindex, not in sitemap)` : ''}`);
console.log(`worry chars: min ${Math.min(...wcounts)} / max ${Math.max(...wcounts)}`);
console.log(`card-specific chars: min ${Math.min(...counts)} / max ${Math.max(...counts)} (threshold ${MIN_CHARS})`);
if (thin.length) {
  console.log(`THIN CONTENT (< ${MIN_CHARS}):`);
  for (const t of thin) console.log(`  ${t.id} ${t.name}: ${t.chars}`);
  process.exitCode = 1;
} else {
  console.log('thin content: none');
}

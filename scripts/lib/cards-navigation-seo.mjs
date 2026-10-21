import { readFileSync } from 'node:fs';
import { seoForPath, updateSeoHead } from './cards-seo.mjs';

const ORIGIN = 'https://decisionprocess.net';
const INDEX_NAME = 'タロットカード78枚の意味';
const INDEX_LINK = 'すべてのカード・悩み一覧を見る';
const cards = JSON.parse(readFileSync(new URL('../../dist/assets/cards.json', import.meta.url), 'utf8')).cards;
const worries = JSON.parse(readFileSync(new URL('../data/worries.json', import.meta.url), 'utf8'));
const worryLinks = JSON.parse(readFileSync(new URL('../data/card-worry-links.json', import.meta.url), 'utf8'));
const worryBySlug = new Map(worries.map(w => [w.slug, w]));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const script = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
for (const c of cards) {
  const slugs = worryLinks[c.id];
  if (!Array.isArray(slugs) || slugs.length < 2 || slugs.length > 3 || new Set(slugs).size !== slugs.length || slugs.some(s => !worryBySlug.has(s))) {
    throw new Error(`Invalid related worries: ${c.id}`);
  }
}

const worryCta = {
  tenshoku: ['今の職場に残るか、転職するか。二つの選択肢を、カードの問いかけで整理してみませんか。', '転職するか、DECIDE.で考える'],
  wakare: ['関係を続けるか、別れるか。大切にしたい気持ちを、カードの問いかけで整理してみませんか。', 'これからの関係を、DECIDE.で考える'],
  hikkoshi: ['今の場所に住み続けるか、引っ越すか。暮らしの条件と気持ちを並べてみませんか。', '引っ越すか、DECIDE.で考える'],
  kekkon: ['結婚へ進むか、もう少し時間をかけるか。自分の気持ちと現実の条件を整理してみませんか。', '結婚への迷いを、DECIDE.で整理する'],
  manabi: ['学び直しに踏み出すか、今は待つか。これから大切にしたいことを整理してみませんか。', '学び直すか、DECIDE.で考える'],
  dokuritsu: ['独立に踏み出すか、準備を続けるか。期待と不安を、カードの問いかけで整理してみませんか。', '独立するか、DECIDE.で考える'],
  ningen: ['関わり方を変えるか、距離を置くか。自分が無理なく過ごせる選択を考えてみませんか。', '人間関係の迷いを、DECIDE.で整理する'],
  okane: ['「今買う」と「もう少し待つ」。二つの選択肢を、カードの問いかけで整理してみませんか。', '買うか待つか、DECIDE.で考える'],
  renai: ['想いを伝えるか、もう少し待つか。相手への気持ちと自分の希望を整理してみませんか。', '恋愛の迷いを、DECIDE.で考える'],
  shukatsu: ['どちらの仕事を選ぶか。条件だけでは決めきれない気持ちを、カードの問いかけで整理してみませんか。', '就活の選択を、DECIDE.で考える'],
  kaigo: ['どこまで自分で担うか、どんな支えを頼るか。家族と自分の暮らしを整理してみませんか。', '介護の迷いを、DECIDE.で整理する'],
  fukugyo: ['副業を始めるか、今は待つか。使える時間とやりたい気持ちを整理してみませんか。', '副業を始めるか、DECIDE.で考える'],
};

// Shared by full generation and the in-place updater: preserves existing article copy/styles.
export function enhanceCardsPage(html, path) {
  const seo = seoForPath(path);
  if (!seo) return html;
  html = updateSeoHead(html, seo);
  const h1 = decode(html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1]?.replace(/<[^>]+>/g, '') || '');
  if (!h1) throw new Error(`Missing h1: ${path}`);
  const url = ORIGIN + path;
  const crumbs = [{ '@type': 'ListItem', position: 1, name: 'DECIDE.', item: ORIGIN + '/' },
    { '@type': 'ListItem', position: 2, name: INDEX_NAME, item: ORIGIN + '/cards/' }];
  if (path !== '/cards/') crumbs.push({ '@type': 'ListItem', position: 3, name: h1, item: url });
  const ld = [];
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>\s*/g, (_, raw) => {
    const value = JSON.parse(raw);
    if (value['@type'] !== 'BreadcrumbList' && value['@type'] !== 'WebPage') {
      if (value['@type'] === 'Article') {
        Object.assign(value, { headline: seo.title, description: seo.description, url, mainEntityOfPage: url });
        for (const field of ['author', 'publisher']) value[field] = { ...value[field], '@type': 'Organization', name: 'DECIDE.', ...(field === 'publisher' ? { url: ORIGIN + '/' } : {}) };
      }
      ld.push(value);
    }
    return '';
  });
  if (!ld.some(x => x['@type'] === 'Article')) ld.push({ '@context': 'https://schema.org', '@type': 'WebPage', name: seo.title, headline: seo.title,
    description: seo.description, url, inLanguage: 'ja', publisher: { '@type': 'Organization', name: 'DECIDE.', url: ORIGIN + '/' } });
  ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs });
  html = html.replace('</head>', ld.map(script).join('\n') + '\n</head>');
  const visible = `<nav class="crumbs" aria-label="パンくずリスト"><ol>${crumbs.map((c, i) => i === crumbs.length - 1
    ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${i === 0 ? '../' : './'}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
  html = html.replace(/<nav class="crumbs"[\s\S]*?<\/nav>/, visible);
  const id = path.match(/\/((?:ar|cu|wa|sw|pe)\d{2})$/)?.[1];
  const slug = path.match(/\/worry-([a-z]+)$/)?.[1];
  if (id) {
    const card = cards.find(c => c.id === id);
    const suit = cards.filter(c => c.arcana === card.arcana);
    const pos = suit.findIndex(c => c.id === id);
    const neighbor = (c, direction) => c ? `<a href="./${c.id}" rel="${direction}"><small>${direction === 'prev' ? '← 前のカード' : '次のカード →'}</small>${esc(c.name)}</a>` : '';
    const pager = `<nav aria-label="前後のカード"><ul class="pager">\n<li class="prev">${neighbor(suit[pos - 1], 'prev')}</li>\n<li class="next">${neighbor(suit[pos + 1], 'next')}</li>\n</ul></nav>`;
    html = html.replace(/<nav aria-label="前後のカード">[\s\S]*?<\/nav>/, pager);
    const section = `<!-- related-worries:start -->\n<section>\n<h2>このカードの視点で考えたい悩み</h2>\n<p>${id === 'cu12' ? '想いを伝えるか、相手の提案を受けるか。近いテーマから、迷いを整理するヒントを探せます。' : 'いまの迷いに近いテーマから、考え方と自分への問いかけを探せます。'}</p>\n<ul class="cats" aria-label="関連する悩み">\n${worryLinks[id].map(s => `<li><a href="./worry-${s}">${esc(worryBySlug.get(s).h1)}</a></li>`).join('\n')}\n</ul>\n<p class="note"><a href="./">${INDEX_LINK}</a></p>\n</section>\n<!-- related-worries:end -->`;
    if (html.includes('<!-- related-worries:start -->')) html = html.replace(/<!-- related-worries:start -->[\s\S]*?<!-- related-worries:end -->/, section);
    else html = html.replace('</article>', section + '\n</article>');
  }
  if (slug) html = html.replace('<h2>ほかの悩みから読む</h2>', '<h2>他の悩みから探す</h2>').replace(/78枚すべてのカード解説を見る/g, INDEX_LINK);
  if (id || slug) {
    const ctas = [...html.matchAll(/<aside class="cta"[\s\S]*?<\/aside>/g)];
    const last = ctas.at(-1);
    if (!last) throw new Error(`Missing CTA: ${path}`);
    const href = last[0].match(/<a href="([^"]+)"/)?.[1];
    if (!href) throw new Error(`Missing CTA href: ${path}`);
    const [message, button] = slug ? worryCta[slug] : id === 'cu12'
      ? ['誘いを受けるか、想いを伝えるか。いまの迷いを、カードを引いて整理してみませんか。', 'カードを引いて、自分の気持ちを整理する']
      : ['意味を読んだら、次はあなた自身の迷いへ。カードを引いて、自分の選択肢を整理してみませんか。', 'カードを引いて、自分の迷いを整理する'];
    const cta = `<aside class="cta" aria-label="DECIDE.で迷いを整理する">\n<p>${esc(message)}</p>\n<a href="${href}">${esc(button)}</a>\n</aside>`;
    html = html.slice(0, last.index) + cta + html.slice(last.index + last[0].length);
  }
  return updateSeoHead(html, seo);
}

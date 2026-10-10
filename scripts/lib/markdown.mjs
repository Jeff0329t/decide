// 記事用の小さな Markdown / front matter パーサ（依存なし）。
// 対応: ## / ### 見出し、段落、- / 1. リスト、> 引用、**太字**、[文字](URL)、<!-- コメント（出力しない） -->
// 生の HTML はすべてエスケープする。リンクは http(s) とサイト内の "/..." のみ許可（"/x" は記事ページから見た "../x" に変換）。
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function scalar(v) {
  v = v.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== '');
  if (/^(["']).*\1$/.test(v)) return v.slice(1, -1);
  return v;
}

export function parseFrontMatter(src) {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 1) throw new Error(`bad front matter line: ${line}`);
    data[line.slice(0, i).trim()] = scalar(line.slice(i + 1));
  }
  return { data, body: text.slice(m[0].length) };
}

export function safeHref(url) {
  const u = url.trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(u)) return '..' + u;
  return null;
}

export function inline(s) {
  // 先にエスケープしてから記法を置換する（記法の中身もエスケープ済みになる）
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, url) => {
    const raw = url.replace(/&amp;/g, '&');
    const href = safeHref(raw);
    return href ? `<a href="${esc(href)}">${label}</a>` : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

// 戻り値: { html, text, headings } — text は文字数カウント用、headings は h2 の位置（中間CTAの挿入に使う）
export function renderMarkdown(md) {
  const src = md.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const lines = src.split('\n');
  const blocks = [];
  const text = [];
  let para = [];
  let list = null;
  let quote = [];
  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'p', html: `<p>${inline(para.join(''))}</p>` }); text.push(para.join('')); para = []; }
  };
  const flushList = () => {
    if (list) { blocks.push({ type: 'list', html: `<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>` }); text.push(list.items.join('')); list = null; }
  };
  const flushQuote = () => {
    if (quote.length) { blocks.push({ type: 'quote', html: `<blockquote><p>${inline(quote.join(''))}</p></blockquote>` }); text.push(quote.join('')); quote = []; }
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushAll(); continue; }
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
      flushAll();
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      blocks.push({ type: tag, html: `<${tag}>${inline(m[2])}</${tag}>` });
      text.push(m[2]);
      continue;
    }
    if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/))) {
      flushPara(); flushQuote();
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(m[2]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList();
      quote.push(m[1]);
      continue;
    }
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flushAll();
  return { blocks, html: blocks.map((b) => b.html).join('\n'), text: text.join('') };
}

const REQUIRED = ['slug', 'title', 'h1', 'description', 'date', 'keyword', 'primary'];

// 記事を読み込んで検証する。drafts=false のときは draft: true の記事を除外する。
export function loadArticles(dir, { drafts = false, worrySlugs = [], cardIds = [] } = {}) {
  if (!existsSync(dir)) return [];
  const worrySet = new Set(worrySlugs);
  const cardSet = new Set(cardIds);
  const seen = new Set();
  const list = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const { data, body } = parseFrontMatter(readFileSync(dir + f, 'utf8'));
    for (const k of REQUIRED) if (!data[k] || typeof data[k] !== 'string') throw new Error(`${f}: front matter "${k}" is required`);
    if (!/^[a-z0-9-]+$/.test(data.slug)) throw new Error(`${f}: bad slug ${data.slug}`);
    if (seen.has(data.slug)) throw new Error(`${f}: duplicate slug ${data.slug}`);
    seen.add(data.slug);
    for (const k of ['date', 'updated']) if (data[k] && !/^\d{4}-\d{2}-\d{2}$/.test(data[k])) throw new Error(`${f}: ${k} must be YYYY-MM-DD`);
    const worries = data.worries || [];
    const cards = data.cards || [];
    if (!Array.isArray(worries) || !Array.isArray(cards)) throw new Error(`${f}: worries/cards must be [a, b]`);
    for (const w of worries) if (!worrySet.has(w)) throw new Error(`${f}: unknown worry ${w}`);
    for (const c of [data.primary, ...cards]) if (!cardSet.has(c)) throw new Error(`${f}: unknown card ${c}`);
    if (typeof data.draft !== 'boolean') throw new Error(`${f}: draft must be true or false`);
    if (data.draft && !drafts) continue;
    list.push({ ...data, worries, cards, file: f, ...renderMarkdown(body) });
  }
  return list.sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
}

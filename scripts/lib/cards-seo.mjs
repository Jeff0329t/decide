import { readFileSync } from 'node:fs';

// Editorial copy is shared by full builds and the metadata-only update command.
export const cardsSeo = JSON.parse(readFileSync(new URL('../data/cards-seo.json', import.meta.url), 'utf8'));
const titles = new Set();
const descriptions = new Set();
for (const [file, { title, description }] of Object.entries(cardsSeo)) {
  if (!/^[a-z0-9-]+\.html$/.test(file)) throw new Error(`Invalid SEO filename: ${file}`);
  for (const [text, min, max] of [[title, 28, 35], [description, 80, 110]]) {
    if (typeof text !== 'string' || [...text].length < min || [...text].length > max) {
      throw new Error(`Invalid SEO copy length: ${file}`);
    }
  }
  if (titles.has(title) || descriptions.has(description)) throw new Error(`Duplicate SEO copy: ${file}`);
  titles.add(title);
  descriptions.add(description);
}

export function seoForPath(path) {
  if (!path.startsWith('/cards/')) return null;
  const file = (path.slice('/cards/'.length) || 'index') + '.html';
  if (!cardsSeo[file]) throw new Error(`Missing SEO copy: ${path}`);
  return cardsSeo[file];
}

const escapeAttribute = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function updateSeoHead(html, { title, description }) {
  let heads = 0;
  const result = html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, (head) => {
    heads++;
    head = head.replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/gi, '');
    head = head.replace(/<meta\b[^>]*>\s*/gi, (tag) => {
      const key = tag.match(/\b(?:name|property)\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase();
      return ['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'].includes(key) ? '' : tag;
    });
    const tags = [`<title>${escapeAttribute(title)}</title>`,
      `<meta name="description" content="${escapeAttribute(description)}">`,
      `<meta property="og:title" content="${escapeAttribute(title)}">`,
      `<meta property="og:description" content="${escapeAttribute(description)}">`,
      `<meta name="twitter:title" content="${escapeAttribute(title)}">`,
      `<meta name="twitter:description" content="${escapeAttribute(description)}">`];
    return head.replace(/<script type="application\/ld\+json">|<\/head>$/i, (anchor) => tags.join('\n') + '\n' + anchor);
  });
  if (heads !== 1) throw new Error('Expected exactly one head');
  return result;
}

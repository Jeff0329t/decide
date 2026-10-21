#!/usr/bin/env node
// Update metadata, structured data and navigation without regenerating article copy.
// Usage: node scripts/update-cards-seo.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cardsSeo } from './lib/cards-seo.mjs';
import { enhanceCardsPage } from './lib/cards-navigation-seo.mjs';

const dir = new URL('../dist/cards/', import.meta.url);
const files = readdirSync(dir).filter((file) => file.endsWith('.html')).sort();
if (JSON.stringify(files) !== JSON.stringify(Object.keys(cardsSeo).sort())) {
  throw new Error('HTML files and SEO definitions must match exactly');
}
// Prepare and validate every file before writing any changes.
const updates = files.map((file) => {
  const path = new URL(file, dir);
  return [path, enhanceCardsPage(readFileSync(path, 'utf8'), `/cards/${file === 'index.html' ? '' : file}`)];
});
for (const [path, html] of updates) writeFileSync(path, html);
console.log(`Updated SEO and navigation: ${updates.length} card pages`);

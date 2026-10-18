#!/usr/bin/env node
// Update metadata without rebuilding body content from unrelated working data.
// Usage: node scripts/update-cards-seo.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cardsSeo, updateSeoHead } from './lib/cards-seo.mjs';

const dir = new URL('../dist/cards/', import.meta.url);
const files = readdirSync(dir).filter((file) => file.endsWith('.html')).sort();
if (JSON.stringify(files) !== JSON.stringify(Object.keys(cardsSeo).sort())) {
  throw new Error('HTML files and SEO definitions must match exactly');
}
// Prepare and validate every file before writing any changes.
const updates = files.map((file) => {
  const path = new URL(file, dir);
  return [path, updateSeoHead(readFileSync(path, 'utf8'), cardsSeo[file])];
});
for (const [path, html] of updates) writeFileSync(path, html);
console.log(`Updated metadata: ${updates.length} card pages`);

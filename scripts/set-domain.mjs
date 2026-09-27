// 独自ドメイン・Android パッケージ情報を dist に反映する。
// 使い方:
//   node scripts/set-domain.mjs --domain decide.example.com
//   node scripts/set-domain.mjs --package com.example.decide --sha256 AA:BB:...,CC:DD:...
//   node scripts/set-domain.mjs --email you@example.com
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => {
  const [k, ...v] = s.trim().split(/\s+/);
  return [k, v.join(' ')];
}));

function edit(file, fn) {
  const path = dist + file;
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after !== before) { writeFileSync(path, after); console.log(`updated ${file}`); }
}

if (args.domain) {
  const domain = args.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const origin = `https://${domain}/`;
  edit('index.html', s => s.replace(/https:\/\/[^"']+?\/(?=(og-image-v3\.png)?")/g, origin));
}

if (args.package || args.sha256) {
  edit('.well-known/assetlinks.json', s => {
    const json = JSON.parse(s);
    const target = json[0].target;
    if (args.package) target.package_name = args.package;
    if (args.sha256) target.sha256_cert_fingerprints = args.sha256.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
    return JSON.stringify(json, null, 2) + '\n';
  });
}

if (args.email) {
  edit('privacy.html', s => s.replaceAll('__CONTACT_EMAIL__', args.email));
}

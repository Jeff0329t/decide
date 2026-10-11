// 使い方: dist/service-worker.js の SHELL_CACHE を上げたあとに
//   node scripts/update-sw-fingerprint.mjs
// を実行して tests/fixtures/sw-shell-fingerprint.json を更新する。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shellFingerprint } from './lib/sw-fingerprint.mjs';

const { cache, sha256 } = shellFingerprint();
const out = new URL('../tests/fixtures/sw-shell-fingerprint.json', import.meta.url);
writeFileSync(out, JSON.stringify({ cache, sha256 }, null, 2) + '\n');
console.log(`wrote ${fileURLToPath(out)}\n  cache:  ${cache}\n  sha256: ${sha256}`);

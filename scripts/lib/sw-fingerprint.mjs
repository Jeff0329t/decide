// service-worker.js の SHELL_FILES のうちテキスト（HTML/JS/CSS/JSON/manifest）を連結した sha256 を返す。
// これらは cache-first で配信されるため、中身が変わったら SHELL_CACHE も上げないと既存ユーザーに届かない。
// tests/sw-version.test.mjs と scripts/update-sw-fingerprint.mjs が共用する。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DIST = new URL('../../dist/', import.meta.url);
const TEXT_EXT = /\.(?:html|js|css|json|webmanifest)$/;

export function readServiceWorker() {
  return readFileSync(new URL('service-worker.js', DIST), 'utf8');
}

export function shellCacheName(sw = readServiceWorker()) {
  const match = sw.match(/const SHELL_CACHE = '([^']+)'/);
  if (!match) throw new Error('SHELL_CACHE not found in dist/service-worker.js');
  return match[1];
}

export function shellTextFiles(sw = readServiceWorker()) {
  const block = sw.match(/const SHELL_FILES = \[([\s\S]*?)\];/);
  if (!block) throw new Error('SHELL_FILES not found in dist/service-worker.js');
  const paths = [...block[1].matchAll(/'\.\/([^'?]*)(?:\?[^']*)?'/g)]
    .map(match => match[1] === '' ? 'index.html' : match[1])
    .filter(path => TEXT_EXT.test(path));
  return [...new Set(paths)].sort();
}

export function shellFingerprint(sw = readServiceWorker()) {
  const files = shellTextFiles(sw);
  const hash = createHash('sha256');
  for (const path of files) {
    hash.update(path).update('\0').update(readFileSync(new URL(path, DIST))).update('\0');
  }
  return { cache: shellCacheName(sw), files, sha256: hash.digest('hex') };
}

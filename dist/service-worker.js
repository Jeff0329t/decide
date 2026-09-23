const SHELL_CACHE = 'decide-shell-obsidian-backs-v1';
const IMAGE_CACHE = 'decide-card-images-p14-v1';
const IMAGE_LIMIT = 100;
const SHELL_FILES = [
  './', './index.html', './app.js', './styles.css', './scoring.js',
  './shared.js', './interview.js', './decision-meta.js', './backup-format.js', './card-backs.js', './learn.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './icon-512-maskable.png', './apple-touch-icon.png',
  './assets/cards.json', './assets/card-back-lines.jpg'
];
const SCOPE = new URL(self.registration.scope);
const shellUrls = new Set(SHELL_FILES.map(path => new URL(path, SCOPE).href));
let imageCacheWrite = Promise.resolve();

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name =>
      (name.startsWith('decide-shell-') && name !== SHELL_CACHE) ||
      (name.startsWith('decide-card-images-') && name !== IMAGE_CACHE)
    ).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheCardImage(request, event) {
  const cache = await caches.open(IMAGE_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      imageCacheWrite = imageCacheWrite.catch(() => {}).then(async () => {
        await cache.put(request, copy);
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - IMAGE_LIMIT))) await cache.delete(old);
      });
      event.waitUntil(imageCacheWrite.catch(() => {}));
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match(new URL('./', SCOPE).href).then(saved => saved || fetch(request)));
    return;
  }
  if (/^\/assets\/rider-waite\/(?:ar|wa|cu|sw|pe)\d{2}(?:-(?:320|480))?\.(?:jpg|webp)$/.test(url.pathname)) {
    event.respondWith(cacheCardImage(request, event));
    return;
  }
  if (shellUrls.has(url.href)) {
    event.respondWith(caches.match(request).then(saved => saved || fetch(request)));
  }
});

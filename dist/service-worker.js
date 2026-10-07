const SHELL_CACHE = 'decide-shell-editorial-v73';
const IMAGE_CACHE = 'decide-card-images-p14-v1';
const IMAGE_LIMIT = 100;
const CARD_SHELL_FILES = [
  ...Array.from({length:22},(_,index)=>`./assets/rider-waite/ar${String(index).padStart(2,'0')}`),
  ...['wa','cu','sw','pe'].flatMap(code=>Array.from({length:14},(_,index)=>`./assets/rider-waite/${code}${String(index+1).padStart(2,'0')}`))
].map(path=>`${path}-320.webp`);
const SHELL_FILES = [
  './', './index.html', './app.js', './styles.css', './scoring.js',
  './shared.js', './interview.js', './decision-meta.js', './backup-format.js', './card-backs.js', './learn.js', './config.js', './auth.js', './entitlements.js', './sync.js',
  './manifest.webmanifest', './icon-192.png?v=2', './icon-512.png?v=2',
  './icon-512-maskable.png?v=2', './apple-touch-icon.png?v=2',
  './assets/cards.json', './assets/learn.json', './assets/card-back-lines.jpg',
  './assets/editorial/home-collage.webp', './assets/editorial/choice-collage.webp',
  './assets/editorial/draw-collage.webp', './assets/editorial/result-collage.webp',
  './assets/editorial/dark-collage.webp', './assets/editorial/compare-collage.webp',
  './assets/editorial/deep-collage.webp', './assets/editorial/decision-collage.webp',
  './assets/editorial/complete-collage.webp', './assets/editorial/review-collage.webp',
  ...CARD_SHELL_FILES
];
const SCOPE = new URL(self.registration.scope);
const shellUrls = new Set(SHELL_FILES.map(path => new URL(path, SCOPE).href));
let imageCacheWrite = Promise.resolve();

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES.map(path => new Request(path, {cache: 'reload'})))));
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
  const saved = await cache.match(request) || await caches.open(SHELL_CACHE).then(shell=>shell.match(request));
  if (saved) return saved;
  const small = new URL(request.url.replace(/(?:-480\.webp|\.jpg)$/, '-320.webp')).href;
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
    // Offline: fall back to the precached 320px variant instead of a broken image.
    return await caches.match(small) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;
  if (request.mode === 'navigate') {
    // Standalone pages such as privacy.html must not be answered with the app shell.
    if (/\.html$/.test(url.pathname) && !url.pathname.endsWith('/index.html')) return;
    event.respondWith(caches.match(new URL('./', SCOPE).href).then(saved => saved || fetch(request)));
    return;
  }
  if (/\/assets\/rider-waite\/(?:ar|wa|cu|sw|pe)\d{2}(?:-(?:320|480))?\.(?:jpg|webp)$/.test(url.pathname)) {
    event.respondWith(cacheCardImage(request, event));
    return;
  }
  if (shellUrls.has(url.href)) {
    event.respondWith(caches.match(request).then(saved => saved || fetch(request)));
  }
});

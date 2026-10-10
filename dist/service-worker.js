const SHELL_CACHE = 'decide-shell-editorial-v107';
const IMAGE_CACHE = 'decide-card-images-p14-v1';
const IMAGE_LIMIT = 100;
const CARD_SHELL_FILES = [
  ...Array.from({length:22},(_,index)=>`./assets/rider-waite/ar${String(index).padStart(2,'0')}`),
  ...['wa','cu','sw','pe'].flatMap(code=>Array.from({length:14},(_,index)=>`./assets/rider-waite/${code}${String(index+1).padStart(2,'0')}`))
].map(path=>`${path}-320.webp`);
const SHELL_FILES = [
  './', './index.html', './app.js', './styles.css', './scoring.js',
  './shared.js', './interview.js', './decision-meta.js', './backup-format.js', './card-backs.js', './learn.js', './config.js', './auth.js', './entitlements.js', './sync.js',
  './reminders.js', './share-themes.js', './referral.js', './push.js', './card-entry.js',
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

// 案内バーの「更新する」から届く。待機をやめて新版に切り替える
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
  if (url.pathname.includes('/cards/') || url.pathname.includes('/articles/') || url.pathname.endsWith('/sitemap.xml') || url.pathname.endsWith('/robots.txt')) return;
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

// ふり返りの通知：ページが IndexedDB に入れた {id, remindAt, notified} だけを見る（ログの中身は見ない）
function openRemindDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('decide-remind', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('items')) req.result.createObjectStore('items', {keyPath: 'id'}); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function notifyDueReviews() {
  const db = await openRemindDb();
  try {
    const items = await new Promise((resolve, reject) => {
      const req = db.transaction('items', 'readonly').objectStore('items').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const now = Date.now();
    const due = items.filter(item => item && !item.notified && Date.parse(item.remindAt) <= now);
    if (!due.length) return;
    await self.registration.showNotification('あの決断、どうなった？', {
      body: 'ふり返りの時間です。アプリを開いて、その後を記録しましょう。',
      tag: 'decide-remind',
      icon: new URL('./icon-192.png?v=2', SCOPE).href
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite');
      const store = tx.objectStore('items');
      due.forEach(item => store.put({...item, notified: true}));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

self.addEventListener('periodicsync', event => {
  if (event.tag !== 'decide-remind') return;
  event.waitUntil(notifyDueReviews().catch(() => {}));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const open = windows.find(client => client.url.startsWith(SCOPE.href));
    if (open) return open.focus();
    return self.clients.openWindow(SCOPE.href);
  })());
});

// プッシュ通知（push.js / Edge Function send-reminders）。文面は決まった一文だけ。
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (error) {}
  event.waitUntil(self.registration.showNotification(data.title || 'あの決断、どうなった？', {
    body: data.body || 'ふり返りの時間です。アプリを開いて、その後を記録しましょう。',
    tag: data.tag || 'decide-remind',
    icon: new URL('./icon-192.png?v=2', SCOPE).href
  }));
});

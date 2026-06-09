// OKVISION Pro — Service Worker
// Strategiya: ilova qobig'i offline ishlaydi, Supabase/AI hech qachon keshlanmaydi,
// yangi versiya avtomatik aniqlanadi.

const CACHE_VERSION = 'okvision-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// Ilova qobig'i — offline uchun kerakli fayllar
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Keshlanmaydigan hostlar (har doim tarmoqdan — realtime/auth/AI)
const NEVER_CACHE = [
  'supabase.co',
  'supabase.in',
  'api.anthropic.com',
  '/auth/',
  '/realtime/',
  '/rest/v1/',
  '/storage/v1/'
];

// Kesh-birinchi (barqaror tashqi kutubxonalar)
const CACHE_FIRST_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// ── O'rnatish ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Faollashtirish — eski keshlarni tozalash ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── So'rovlarni boshqarish ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Faqat GET keshlanadi
  if (req.method !== 'GET') return;

  // Keshlanmaydigan hostlar — to'g'ridan tarmoqqa
  if (NEVER_CACHE.some(p => url.href.includes(p))) {
    return; // brauzer o'zi hal qiladi (tarmoq)
  }

  // Navigatsiya (HTML sahifa) — tarmoq-birinchi, oflayn bo'lsa keshdan
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then(c => c.put('/index.html', copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }

  // Barqaror kutubxonalar/shriftlar — kesh-birinchi
  if (CACHE_FIRST_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          const copy = resp.clone();
          caches.open(ASSET_CACHE).then(c => c.put(req, copy)).catch(() => {});
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Mahalliy ikonkalar/aktivlar — kesh-birinchi
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(ASSET_CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Qolgan hammasi — tarmoq-birinchi
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// ── Asosiy ilova bilan aloqa ────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push bildirishnoma bosilganda — ilovani ochish/fokuslash ────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

// ── Server push (kelajakda — VAPID bilan) ───────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'OKVISION Pro', body: 'Sizda yangi xabar bor' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'OKVISION Pro', {
      body: data.body || 'Sizda yangi xabar bor',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'okv-msg',
      renotify: true
    })
  );
});

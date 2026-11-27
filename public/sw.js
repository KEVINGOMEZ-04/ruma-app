/**
 * ruma 🌟 — Service Worker Nativo (PWA + Android/Capacitor + Background Sync + Notificaciones)
 */

const CACHE_NAME = 'ruma-shell-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/ruma_icon_192.png',
  './assets/ruma_icon_512.png',
  './assets/ruma_home_axolotl.png',
  './assets/ruma_default_avatar.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first para navegación y bundles de la app con fallback a caché offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

// Background Sync & Periodic Background Sync: despierta a los clientes activos para reanudar cargas y nube
async function notifyClientsToSync(reason) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: 'RUMA_BACKGROUND_SYNC', reason });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'ruma-drive-resume' || event.tag === 'ruma-cloud-sync') {
    event.waitUntil(notifyClientsToSync(event.tag));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'ruma-periodic-sync') {
    event.waitUntil(notifyClientsToSync('periodic'));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetData = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'RUMA_NOTIFICATION_CLICK', data: targetData });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});

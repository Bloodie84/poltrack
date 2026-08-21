/*
 * Service worker minimal — phase 1.
 *
 * Portée volontairement limitée à la coque applicative :
 *   - les fichiers statiques versionnés sont servis depuis le cache ;
 *   - les navigations passent par le réseau, avec une page de repli hors ligne ;
 *   - AUCUNE réponse HTML ni AUCUNE donnée applicative n'est mise en cache,
 *     pour ne pas exposer les données d'un compte sur un appareil partagé.
 *
 * Le vrai mode hors ligne (traces, découvertes, file de synchronisation) est
 * l'objet de la phase 5 et reposera sur IndexedDB.
 */
const CACHE = 'prospect-shell-v1';
const OFFLINE_URL = '/hors-ligne';
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Fichiers statiques versionnés : leur nom change à chaque build.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())),
    );
  }
});

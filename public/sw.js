'use strict';

const VERSION = 'safetap-shell-v26-photo';
const BUILD = '26-photo';
const SCRIPTS = [
  '/theme.js', '/app.js', '/js/device-store.js', '/js/assets.js',
  '/js/student-directory.js', '/js/scanners.js', '/js/offline-controller.js', '/js/views.js'
];
const SHELL = [
  '/index.html',
  ...[...SCRIPTS, '/styles.css', '/fonts.css'].map(file => `${file}?v=${BUILD}`),
  '/assets/fonts/OpenSans-Regular.ttf', '/assets/fonts/OpenSans-Semibold.ttf',
  '/assets/fonts/OpenSans-Bold.ttf', '/manifest.webmanifest', '/assets/icon-maroon.svg', '/assets/alangilan-campus-2010.jpg',
  '/assets/cics-floorplan.png', '/socket.io/socket.io.min.js'
];
const SHELL_PATHS = new Set(SHELL.map(file => file.split('?')[0]));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION)
    .then(cache => cache.addAll(SHELL))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('safetap-shell-') && key !== VERSION)
      .map(key => caches.delete(key))))
    .then(async () => {
      const cache = await caches.open('safetap-vendor-v1');
      const requests = await cache.keys();
      // Keep the QR library while removing the retired ID-photo download.
      await Promise.all(requests.filter(request => {
        const pathname = new URL(request.url).pathname;
        return pathname.startsWith('/vendor/') && pathname !== '/vendor/html5-qrcode.min.js';
      }).map(request => cache.delete(request)));
    })
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const socketTransport = url.pathname.startsWith('/socket.io/') && url.pathname !== '/socket.io/socket.io.min.js';
  if (event.request.method !== 'GET' || url.origin !== location.origin ||
    url.pathname.startsWith('/api/') || url.pathname === '/health' || socketTransport) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
  if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      // Build-versioned files are immutable. Reopening the app should not
      // download identical scripts and styles over mobile data.
      const cached = await caches.match(event.request);
      if (cached && url.searchParams.get('v') === BUILD) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(VERSION);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        const fallback = cached || await caches.match(`${url.pathname}?v=${BUILD}`);
        if (fallback) return fallback;
        throw error;
      }
    })());
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

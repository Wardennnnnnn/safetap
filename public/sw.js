'use strict';

const VERSION = 'safetap-shell-v7-auto-offline';
const SHELL = ['/', '/index.html', '/theme.js', '/theme.js?v=7-auto-offline', '/app.js', '/app.js?v=7-auto-offline', '/styles.css', '/styles.css?v=7-auto-offline', '/fonts.css', '/fonts.css?v=7-auto-offline', '/assets/fonts/OpenSans-Regular.ttf', '/assets/fonts/OpenSans-Semibold.ttf', '/assets/fonts/OpenSans-Bold.ttf', '/manifest.webmanifest', '/assets/icon.svg', '/assets/cics-floorplan.png', '/socket.io/socket.io.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('safetap-shell-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname.startsWith('/socket.io/') && url.pathname !== '/socket.io/socket.io.js') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
  if (SHELL.some(path => path.split('?')[0] === url.pathname)) {
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(VERSION);
        await cache.put(event.request, response.clone());
      }
      return response;
    }).catch(async () => (await caches.match(event.request)) || caches.match(url.pathname)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

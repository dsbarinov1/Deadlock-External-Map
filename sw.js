// A basic Service Worker is required for the browser to trigger the "Install App" prompt.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests. We don't need complex caching for this use case,
  // but the fetch handler must exist for PWA criteria.
  event.respondWith(fetch(event.request));
});
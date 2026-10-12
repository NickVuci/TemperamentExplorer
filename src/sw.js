// Keeps Temperament Lab usable offline. Requests go to the network first, so an
// online visit always runs the deployed files; the cache answers when offline.
// The build replaces VERSION and SHELL; a new VERSION re-caches the whole shell.
const VERSION = 'dev';
const SHELL = [];
const CACHE = 'temperament-lab-' + VERSION;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, {cache: 'reload'}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith('temperament-lab-') && key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request,
    url = new URL(request.url),
    font = FONT_HOSTS.includes(url.hostname);
  if (request.method !== 'GET' || (url.origin !== self.location.origin && !font)) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        // Stylesheet @imports of the font CSS are no-cors, so their responses are opaque.
        if (response.ok || (font && response.type === 'opaque')) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(request, {ignoreSearch: true})) ??
          (request.mode === 'navigate' ? await caches.match('./index.html') : undefined) ??
          Response.error()
      )
  );
});

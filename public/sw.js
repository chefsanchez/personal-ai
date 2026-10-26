/* Cache the public app shell only. Authenticated responses never enter CacheStorage. */
const CACHE = 'personal-ai-shell-v0.4.0';
const SHELL = [
  '/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon.svg',
  '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png',
];
const allowed = new Set(SHELL);
function cacheable(response, pathname) {
  if (!response.ok || response.redirected || response.type === 'opaque') return false;
  const type = response.headers.get('Content-Type') || '';
  return pathname === '/' ? type.includes('text/html') : !type.includes('text/html');
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // An Access redirect must not turn into an offline login page.
    await Promise.all(SHELL.map(async pathname => {
      try {
        const response = await fetch(pathname, {cache:'reload', redirect:'error', credentials:'same-origin'});
        if (cacheable(response, pathname)) await cache.put(pathname, response);
      } catch { /* A missing offline copy does not prevent the online app from opening. */ }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith('personal-ai-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // API, Access routes, downloads, query URLs, and any unknown resource stay network-only.
  if (!allowed.has(url.pathname) || url.search || request.headers.has('Authorization')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (cacheable(response, url.pathname)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.pathname, copy)));
      }
      return response;
    } catch {
      return (await caches.match(url.pathname, {cacheName:CACHE})) || Response.error();
    }
  })());
});

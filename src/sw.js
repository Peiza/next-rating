/*
 * The service worker, so the app works offline after the first load. This is
 * a template: the service worker plugin (scripts/service-worker.ts) fills in
 * the built files and a cache name made from their contents, and writes
 * dist/sw.js. It only ever fetches the app's own files, never pdga.com.
 *
 * Every file is cached on install and served from the cache. A new version
 * waits until the app asks it to take over (the "Reload" notice), so a page
 * never mixes files from two versions.
 */

const CACHE = '__CACHE_NAME__';
const FILES = ['__PRECACHE__'];
const PREFIX = 'next-rating-';

const scope = self.registration.scope;
const INDEX = new URL('index.html', scope).href;

self.addEventListener('install', (event) => {
  // "reload" skips the HTTP cache, so the files match this version.
  const requests = FILES.map((file) => new Request(new URL(file, scope).href, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)))),
  );
});

async function respond(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  // Any page in the app's scope is the app. Requests carry no fragment, so a #d= hand-off works offline too.
  if (request.mode === 'navigate') {
    const index = await cache.match(INDEX);
    if (index) return index;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  event.respondWith(respond(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

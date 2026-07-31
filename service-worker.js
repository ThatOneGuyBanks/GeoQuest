const CACHE_PREFIX = 'day-tripping-quiz-';
const CORE = `${CACHE_PREFIX}v30`;
const ADVENTURES = `${CACHE_PREFIX}adventures-v1`;
const MAP_TILES = `${CACHE_PREFIX}map-tiles-v1`;
const NETWORK_TIMEOUT_MS = 3500;
const MAX_MAP_TILES = 90;

const CORE_URLS = [
  './',
  './index.html',
  './privacy.html',
  './styles.css?v=30',
  './app.js?v=30',
  './manifest.webmanifest',
  './assets/day-tripping-quiz-icon-32.png',
  './assets/day-tripping-quiz-apple-180-dark.png',
  './assets/day-tripping-quiz-icon-192.png',
  './assets/day-tripping-quiz-icon-512.png',
  './assets/day-tripping-quiz-install-192-dark.png',
  './assets/day-tripping-quiz-install-512-dark.png',
  './assets/day-tripping-quiz-maskable-512-dark.png',
  './packs/index.json',
  './data/distance-comparisons.json'
];

const OPTIONAL_MAP_LIBRARY = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CORE);
  await cache.addAll(CORE_URLS);
  await Promise.allSettled(OPTIONAL_MAP_LIBRARY.map(url => cache.add(url)));
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key => key.startsWith(CACHE_PREFIX) && ![CORE, ADVENTURES, MAP_TILES].includes(key))
    .map(key => caches.delete(key)));
  await self.clients.claim();
})()));

function cacheable(response) {
  return response && (response.ok || response.type === 'opaque');
}

async function fetchWithTimeout(request, timeout = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function putIfCacheable(cacheName, request, response) {
  if (!cacheable(response)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function cacheFirst(request, cacheName, updateInBackground = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    if (updateInBackground) {
      fetch(request)
        .then(response => putIfCacheable(cacheName, request, response))
        .catch(() => {});
    }
    return cached;
  }
  const response = await fetchWithTimeout(request);
  return putIfCacheable(cacheName, request, response);
}

async function networkFirst(request, cacheName, fallbackUrl = '') {
  try {
    const response = await fetchWithTimeout(request);
    if (!response.ok && response.type !== 'opaque') throw new Error(`HTTP ${response.status}`);
    return putIfCacheable(cacheName, request, response);
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map(key => cache.delete(key)));
}

async function mapTile(request) {
  const response = await cacheFirst(request, MAP_TILES, true);
  trimCache(MAP_TILES, MAX_MAP_TILES).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CORE, './index.html'));
    return;
  }

  if (sameOrigin && /\/packs\/[^/]+\.json$/.test(url.pathname)) {
    event.respondWith((async () => {
      const saved = await (await caches.open(ADVENTURES)).match(request);
      if (saved) {
        fetch(request)
          .then(response => putIfCacheable(ADVENTURES, request, response))
          .catch(() => {});
        return saved;
      }
      return networkFirst(request, CORE);
    })());
    return;
  }

  if (sameOrigin && (/\/packs\/index\.json$/.test(url.pathname) || /\/data\/distance-comparisons\.json$/.test(url.pathname))) {
    event.respondWith(networkFirst(request, CORE));
    return;
  }

  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(mapTile(request));
    return;
  }

  if (url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(request, CORE, true));
    return;
  }

  if (sameOrigin) event.respondWith(cacheFirst(request, CORE, true));
});

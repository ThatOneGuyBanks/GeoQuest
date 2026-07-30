const CACHE = 'day-tripping-quiz-v21';
const ADVENTURES = 'day-tripping-quiz-adventures-v1';
const CORE = [
  './',
  './index.html',
  './styles.css?v=21',
  './app.js?v=21',
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

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys
    .filter(key => key !== CACHE && key !== ADVENTURES)
    .map(key => caches.delete(key)))),
  self.clients.claim()
])));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});

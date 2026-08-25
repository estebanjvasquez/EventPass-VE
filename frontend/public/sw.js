const CACHE = 'eventpass-shell-v2'
const SHELL = ['/', '/admin', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const request = event.request
  const isAppCode = request.url.includes('/assets/') || request.destination === 'script' || request.destination === 'style' || request.mode === 'navigate'
  event.respondWith(
    (isAppCode ? fetch(request).then((response) => {
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
      return response
    }).catch(() => caches.match(request)) : caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
      return response
    }))).catch(() => caches.match('/'))
  )
})

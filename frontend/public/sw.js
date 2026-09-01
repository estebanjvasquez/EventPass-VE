const CACHE = 'eventpass-shell-v3'
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
  const url = new URL(request.url)

  // Las API autenticadas y cualquier recurso de otro origen deben llegar
  // siempre a la red. Guardarlas en Cache Storage devuelve datos obsoletos y
  // puede mezclar respuestas que dependen de la sesión del usuario.
  if (url.origin !== self.location.origin) return

  const isAppCode = url.pathname.startsWith('/assets/') || request.destination === 'script' || request.destination === 'style' || request.mode === 'navigate'
  if (!isAppCode) return
  event.respondWith(
    fetch(request).then((response) => {
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
      return response
    }).catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : Response.error())))
  )
})

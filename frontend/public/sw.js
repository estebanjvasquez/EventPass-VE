const CACHE = 'eventpass-shell-v4'
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
  const validCode = (response) => {
    const type = response.headers.get('content-type') || ''
    return response.ok && (request.mode === 'navigate' || (request.destination === 'style' ? type.includes('text/css') : request.destination === 'script' ? /javascript|ecmascript|wasm/.test(type) : !type.includes('text/html')))
  }
  event.respondWith(
    fetch(request).then(async (response) => {
      // A stale SPA fallback must never be cached or delivered as JavaScript.
      if (!validCode(response) && request.mode !== 'navigate') {
        const freshUrl = new URL(request.url)
        freshUrl.searchParams.set('asset_retry', CACHE)
        response = await fetch(freshUrl, { cache: 'reload' })
      }
      if (!validCode(response)) throw new Error('Invalid app asset response')
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
      return response
    }).catch(() => caches.match(request).then((cached) => cached && validCode(cached) ? cached : (request.mode === 'navigate' ? caches.match('/') : Response.error())))
  )
})

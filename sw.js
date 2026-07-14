const CACHE_NAME = 'kennyxpay-pos-v20260715-white-screen-fix'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons.svg',
  './payment-qr.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    return
  }

  const isPage = event.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')
  const isBuildAsset = url.pathname.includes('/assets/')

  if (isPage || isBuildAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          }
          return response
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
      .catch(() => caches.match('./index.html'))),
  )
})

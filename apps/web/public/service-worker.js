const CACHE_NAME = 'fragment-prime-shell-v2'
const SHELL_URL = '/'
const PRECACHE_URLS = [
  SHELL_URL,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image', 'worker', 'manifest'])
const STATIC_EXTENSIONS = /\.(css|js|mjs|cjs|json|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp|txt|mp4|webm)$/i
const FRAGMENT_STREAM_PATH = '/fragments/stream'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    return
  }

  if (url.pathname.startsWith(FRAGMENT_STREAM_PATH)) {
    return
  }

  if (isNavigationRequest(request)) {
    event.respondWith(handleShell(event, request))
    return
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(event, request))
  }
})

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document' || request.headers.get('accept')?.includes('text/html')
}

function isStaticAssetRequest(request, url) {
  if (STATIC_DESTINATIONS.has(request.destination)) {
    return true
  }

  return STATIC_EXTENSIONS.test(url.pathname)
}

function isCacheableResponse(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'default')
}

async function handleShell(event, request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    event.waitUntil(networkPromise)
    return cached
  }

  const networkResponse = await networkPromise
  if (networkResponse) {
    return networkResponse
  }

  const fallback = await cache.match(SHELL_URL)
  if (fallback) {
    return fallback
  }

  return Response.error()
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    event.waitUntil(networkPromise)
    return cached
  }

  const networkResponse = await networkPromise
  if (networkResponse) {
    return networkResponse
  }

  const shellFallback = await cache.match(SHELL_URL)
  if (shellFallback) {
    return shellFallback
  }

  return Response.error()
}

/// <reference lib="webworker" />
import { CacheableResponsePlugin, Serwist, StaleWhileRevalidate } from 'serwist'

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision?: string | null })[]
}

const CACHE_NAME = 'fragment-prime-shell-v5'
const DATA_CACHE_NAME = 'fragment-prime-data-v1'
const scopeUrl = new URL(self.registration.scope)
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`
const SHELL_URL = new URL('./', scopeUrl).toString()
const FRAGMENT_STREAM_PATH = '/fragments/stream'
const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image', 'worker', 'manifest'])
const STATIC_EXTENSIONS = /\.(css|js|mjs|cjs|json|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp|txt|mp4|webm)$/i
const OUTBOX_SYNC_TAG = 'p2p-outbox'
const STORE_CART_SYNC_TAG = 'store-cart-queue'

const scopedPathname = (url: URL) => {
  if (scopePath === '/' || !url.pathname.startsWith(scopePath)) return url.pathname
  return `/${url.pathname.slice(scopePath.length)}`
}

const isChatCachePath = (url: URL) => {
  const pathname = scopedPathname(url)
  return pathname.startsWith('/chat/contacts/') || pathname.startsWith('/chat/p2p/')
}

const isNavigationRequest = (request: Request) =>
  request.mode === 'navigate' ||
  request.destination === 'document' ||
  request.headers.get('accept')?.includes('text/html')

const isStaticAssetRequest = (request: Request, url: URL) =>
  STATIC_DESTINATIONS.has(request.destination) || STATIC_EXTENSIONS.test(url.pathname)

const isCacheableResponse = (response?: Response) =>
  response && response.ok && (response.type === 'basic' || response.type === 'default')

const isFragmentStreamPath = (url: URL) =>
  url.pathname === `${scopePath}fragments/stream` || url.pathname.endsWith(FRAGMENT_STREAM_PATH)

const isJsonRequest = (request: Request, url: URL) => {
  if (request.method !== 'GET') return false
  if (url.origin !== self.location.origin) return false
  if (isFragmentStreamPath(url)) return false
  if (isChatCachePath(url)) return true
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('application/json') || url.pathname.endsWith('.json')
}

const handleJson = async ({ event, request }: { event: ExtendableEvent; request: Request }) => {
  const cache = await caches.open(DATA_CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        event.waitUntil(cache.put(request, response.clone()))
      }
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return Response.error()
  }
}

const handleShell = async ({ event, request }: { event: ExtendableEvent; request: Request }) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const networkPromise = fetch(request, { cache: 'reload' })
    .then((response) => {
      if (isCacheableResponse(response)) {
        void cache.put(request, response.clone())
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

const staticAssetStrategy = new StaleWhileRevalidate({
  cacheName: CACHE_NAME,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  fetchOptions: { cache: 'reload' }
})

const handleStaticAsset = async ({
  event,
  request,
  url
}: {
  event: ExtendableEvent
  request: Request
  url: URL
}) => {
  try {
    const response = await staticAssetStrategy.handle({ event, request, url })
    if (response) return response
  } catch {
    // fall through to shell fallback
  }

  const cache = await caches.open(CACHE_NAME)
  const shellFallback = await cache.match(SHELL_URL)
  if (shellFallback) {
    return shellFallback
  }

  return Response.error()
}

const broadcastMessage = async (message: Record<string, unknown>) => {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(clients.map((client: Client) => client.postMessage(message)))
}

const flushOutbox = async (reason: string) => {
  await broadcastMessage({ type: 'p2p:flush-outbox', reason })
}

const flushStoreCartQueue = async (reason: string) => {
  await broadcastMessage({ type: 'store:cart:flush', reason })
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin && !isFragmentStreamPath(url) && isNavigationRequest(request),
      handler: handleShell
    },
    {
      matcher: ({ request, url }) =>
        request.method === 'GET' && url.origin === self.location.origin && isChatCachePath(url),
      handler: handleJson
    },
    {
      matcher: ({ request, url }) => isJsonRequest(request, url),
      handler: handleJson
    },
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin && !isFragmentStreamPath(url) && isStaticAssetRequest(request, url),
      handler: handleStaticAsset
    }
  ]
})

void serwist.addEventListeners()

self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === OUTBOX_SYNC_TAG) {
    event.waitUntil(flushOutbox('sync'))
    return
  }
  if (event.tag === STORE_CART_SYNC_TAG) {
    event.waitUntil(flushStoreCartQueue('sync'))
  }
})

self.addEventListener('message', (event) => {
  const data = event.data as Record<string, unknown> | undefined
  if (data?.type === 'store:cart:flush') {
    event.waitUntil(flushStoreCartQueue('message'))
  }
})

self.addEventListener('push', (event: PushEvent) => {
  let data: Record<string, unknown> | undefined
  try {
    data = event.data?.json?.() as Record<string, unknown> | undefined
  } catch {
    data = undefined
  }
  const title = typeof data?.title === 'string' ? data.title : 'New message'
  const body = typeof data?.body === 'string' ? data.body : 'Open Fragment Prime to sync.'
  const url = typeof data?.url === 'string' ? data.url : '/'
  event.waitUntil(
    Promise.all([
      flushOutbox('push'),
      self.registration.showNotification(title, {
        body,
        data: { url }
      })
    ])
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | undefined
  const targetUrl = typeof data?.url === 'string' ? data.url : '/'
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = clients.find((client: Client) => 'focus' in client) as WindowClient | undefined
      if (focused) {
        await focused.focus()
        focused.postMessage({ type: 'p2p:flush-outbox', reason: 'notification' })
        return
      }
      await self.clients.openWindow(targetUrl)
    })()
  )
})

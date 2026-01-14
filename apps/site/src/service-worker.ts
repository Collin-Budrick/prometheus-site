import { CacheableResponsePlugin, Serwist, StaleWhileRevalidate } from 'serwist'

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision?: string | null })[]
}

const CACHE_NAME = 'fragment-prime-shell-v3'
const SHELL_URL = '/'
const FRAGMENT_STREAM_PATH = '/fragments/stream'
const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image', 'worker', 'manifest'])
const STATIC_EXTENSIONS = /\.(css|js|mjs|cjs|json|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp|txt|mp4|webm)$/i
const OUTBOX_SYNC_TAG = 'p2p-outbox'

const isNavigationRequest = (request: Request) =>
  request.mode === 'navigate' ||
  request.destination === 'document' ||
  request.headers.get('accept')?.includes('text/html')

const isStaticAssetRequest = (request: Request, url: URL) =>
  STATIC_DESTINATIONS.has(request.destination) || STATIC_EXTENSIONS.test(url.pathname)

const isCacheableResponse = (response?: Response) =>
  response && response.ok && (response.type === 'basic' || response.type === 'default')

const handleShell = async ({ event, request }: { event: ExtendableEvent; request: Request }) => {
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

const staticAssetStrategy = new StaleWhileRevalidate({
  cacheName: CACHE_NAME,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
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
  await Promise.all(clients.map((client) => client.postMessage(message)))
}

const flushOutbox = async (reason: string) => {
  await broadcastMessage({ type: 'p2p:flush-outbox', reason })
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin &&
        !url.pathname.startsWith(FRAGMENT_STREAM_PATH) &&
        isNavigationRequest(request),
      handler: handleShell
    },
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin &&
        !url.pathname.startsWith(FRAGMENT_STREAM_PATH) &&
        isStaticAssetRequest(request, url),
      handler: handleStaticAsset
    }
  ]
})

serwist.addEventListeners()

self.addEventListener('sync', (event) => {
  if (event.tag !== OUTBOX_SYNC_TAG) return
  event.waitUntil(flushOutbox('sync'))
})

self.addEventListener('push', (event) => {
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | undefined
  const targetUrl = typeof data?.url === 'string' ? data.url : '/'
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = clients.find((client) => 'focus' in client) as WindowClient | undefined
      if (focused) {
        await focused.focus()
        focused.postMessage({ type: 'p2p:flush-outbox', reason: 'notification' })
        return
      }
      await self.clients.openWindow(targetUrl)
    })()
  )
})

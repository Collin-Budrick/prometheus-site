/// <reference lib="webworker" />
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  Serwist,
  StaleWhileRevalidate
} from 'serwist'

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision?: string | null })[]
}

const CACHE_NAME = 'fragment-prime-shell-v6'
const DATA_CACHE_NAME = 'fragment-prime-data-v1'
const FRAGMENT_PLAN_CACHE_NAME = 'fragment-prime-fragment-plan-v1'
const FRAGMENT_BATCH_CACHE_NAME = 'fragment-prime-fragment-batch-v1'
const FRAGMENT_BATCH_TTL_SECONDS = 30
const scopeUrl = new URL(self.registration.scope)
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`
const SHELL_URL = new URL('./', scopeUrl).toString()
const OFFLINE_FALLBACK_URL = new URL('./offline/', scopeUrl).toString()
const FRAGMENT_STREAM_PATH = '/fragments/stream'
const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image', 'worker', 'manifest'])
const STATIC_EXTENSIONS = /\.(css|js|mjs|cjs|json|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp|avif|txt|mp4|webm)$/i
const HASHED_BUILD_ASSET = /\/build\/.*(?:[.-][a-f0-9]{8,})\./i
const OUTBOX_SYNC_TAG = 'p2p-outbox'
const STORE_CART_SYNC_TAG = 'store-cart-queue'
const INVITE_QUEUE_SYNC_TAG = 'contact-invites-queue'

const scopedPathname = (url: URL) => {
  if (scopePath === '/' || !url.pathname.startsWith(scopePath)) return url.pathname
  return `/${url.pathname.slice(scopePath.length)}`
}

const isStoreCachePath = (url: URL) => {
  const pathname = scopedPathname(url)
  const normalized = pathname.startsWith('/api/') ? pathname.slice(4) : pathname
  return normalized.startsWith('/store/items') || normalized.startsWith('/store/search')
}

const isNavigationRequest = (request: Request) =>
  request.mode === 'navigate' ||
  request.destination === 'document' ||
  request.headers.get('accept')?.includes('text/html')

const isStaticAssetRequest = (request: Request, url: URL) =>
  STATIC_DESTINATIONS.has(request.destination) || STATIC_EXTENSIONS.test(url.pathname)

const isHashedBuildAssetRequest = (request: Request, url: URL) =>
  isStaticAssetRequest(request, url) &&
  scopedPathname(url).startsWith('/build/') &&
  HASHED_BUILD_ASSET.test(url.pathname)

const isCacheableResponse = (response?: Response) =>
  response && response.ok && (response.type === 'basic' || response.type === 'default')

const isFragmentStreamPath = (url: URL) =>
  url.pathname === `${scopePath}fragments/stream` || url.pathname.endsWith(FRAGMENT_STREAM_PATH)

const isFragmentPlanPath = (url: URL) => scopedPathname(url) === '/fragments/plan'

const isFragmentBatchPath = (url: URL) => scopedPathname(url) === '/fragments/batch'

const isJsonRequest = (request: Request, url: URL) => {
  if (request.method !== 'GET') return false
  if (url.origin !== self.location.origin) return false
  if (isFragmentStreamPath(url)) return false
  if (isStoreCachePath(url)) return true
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

  const fallback = await cache.match(OFFLINE_FALLBACK_URL)
  if (fallback) {
    return fallback
  }

  const shell = await cache.match(SHELL_URL)
  if (shell) {
    return shell
  }

  const root = await cache.match(new Request(SHELL_URL))
  if (root) {
    return root
  }

  return Response.error()
}

const staticAssetStrategy = new StaleWhileRevalidate({
  cacheName: CACHE_NAME,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
})

const fragmentPlanStrategy = new StaleWhileRevalidate({
  cacheName: FRAGMENT_PLAN_CACHE_NAME,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
})

const fragmentBatchStrategy = new StaleWhileRevalidate({
  cacheName: FRAGMENT_BATCH_CACHE_NAME,
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({
      maxAgeSeconds: FRAGMENT_BATCH_TTL_SECONDS,
      maxEntries: 50
    })
  ]
})

const hashedBuildAssetStrategy = new CacheFirst({
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

const handleHashedBuildAsset = async ({
  event,
  request,
  url
}: {
  event: ExtendableEvent
  request: Request
  url: URL
}) => {
  const response = await hashedBuildAssetStrategy.handle({ event, request, url })
  if (response) return response
  return Response.error()
}

const handleFragmentPlan = async ({
  event,
  request,
  url
}: {
  event: ExtendableEvent
  request: Request
  url: URL
}) => {
  const response = await fragmentPlanStrategy.handle({ event, request, url })
  if (response) return response
  return Response.error()
}

const handleFragmentBatch = async ({
  event,
  request,
  url
}: {
  event: ExtendableEvent
  request: Request
  url: URL
}) => {
  const response = await fragmentBatchStrategy.handle({ event, request, url })
  if (response) return response
  return Response.error()
}

const broadcastMessage = async (message: Record<string, unknown>) => {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(clients.map((client: Client) => client.postMessage(message)))
}

const clearRuntimeCaches = async () => {
  const keys = await caches.keys()
  const targets = keys.filter(
    (key) =>
      key.startsWith('fragment-prime-shell') ||
      key.startsWith('fragment-prime-data') ||
      key.startsWith('fragment-prime-fragment-plan') ||
      key.startsWith('fragment-prime-fragment-batch')
  )
  await Promise.all(targets.map((key) => caches.delete(key)))
}

const resolveOutboxTarget = async () => {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (!clients.length) return { clients: [], target: undefined }
  const sorted = clients.slice().sort((left, right) => left.id.localeCompare(right.id))
  const target =
    sorted.find((client) => (client as WindowClient).focused) ??
    sorted.find((client) => (client as WindowClient).visibilityState === 'visible') ??
    sorted[0]
  return { clients: sorted, target }
}

const flushOutbox = async (reason: string) => {
  const requestId = `outbox:${Date.now()}:${Math.random().toString(16).slice(2)}`
  const { clients, target } = await resolveOutboxTarget()
  if (target) {
    target.postMessage({ type: 'p2p:flush-outbox', reason, requestId })
    await broadcastMessage({
      type: 'p2p:outbox:status',
      status: 'dispatched',
      reason,
      requestId,
      targetClientId: target.id,
      clientCount: clients.length
    })
    return
  }
  await broadcastMessage({
    type: 'p2p:outbox:status',
    status: 'no-clients',
    reason,
    requestId,
    targetClientId: null,
    clientCount: 0
  })
}

const flushStoreCartQueue = async (reason: string) => {
  await broadcastMessage({ type: 'store:cart:flush', reason })
}

const flushContactInviteQueue = async (reason: string) => {
  await broadcastMessage({ type: 'contact-invites:flush-queue', reason })
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
        request.method === 'GET' &&
        url.origin === self.location.origin &&
        !isFragmentStreamPath(url) &&
        isFragmentPlanPath(url),
      handler: handleFragmentPlan
    },
    {
      matcher: ({ request, url }) =>
        request.method === 'GET' &&
        url.origin === self.location.origin &&
        !isFragmentStreamPath(url) &&
        isFragmentBatchPath(url),
      handler: handleFragmentBatch
    },
    {
      matcher: ({ request, url }) => isJsonRequest(request, url),
      handler: handleJson
    },
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin &&
        !isFragmentStreamPath(url) &&
        isHashedBuildAssetRequest(request, url),
      handler: handleHashedBuildAsset
    },
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin && !isFragmentStreamPath(url) && isStaticAssetRequest(request, url),
      handler: handleStaticAsset
    }
  ]
})

serwist.addEventListeners()

self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === OUTBOX_SYNC_TAG) {
    event.waitUntil(flushOutbox('sync'))
    return
  }
  if (event.tag === STORE_CART_SYNC_TAG) {
    event.waitUntil(flushStoreCartQueue('sync'))
    return
  }
  if (event.tag === INVITE_QUEUE_SYNC_TAG) {
    event.waitUntil(flushContactInviteQueue('sync'))
  }
})

self.addEventListener('message', (event) => {
  const data = event.data as Record<string, unknown> | undefined
  if (data?.type === 'store:cart:flush') {
    event.waitUntil(flushStoreCartQueue('message'))
  }
  if (data?.type === 'contact-invites:flush-queue') {
    event.waitUntil(flushContactInviteQueue('message'))
  }
})

self.addEventListener('message', (event) => {
  const payload = event.data as Record<string, unknown> | null
  if (!payload || typeof payload.type !== 'string') return
  if (payload.type === 'p2p:flush-outbox') {
    const reason = typeof payload.reason === 'string' ? payload.reason : 'manual'
    event.waitUntil(flushOutbox(reason))
  }
  if (payload.type === 'contact-invites:flush-queue') {
    const reason = typeof payload.reason === 'string' ? payload.reason : 'manual'
    event.waitUntil(flushContactInviteQueue(reason))
  }
  if (payload.type === 'sw:refresh-cache') {
    event.waitUntil(
      clearRuntimeCaches().then(() => broadcastMessage({ type: 'sw:cache-refreshed' }))
    )
  }
  if (payload.type === 'sw:clear-cache') {
    event.waitUntil(
      clearRuntimeCaches().then(() => broadcastMessage({ type: 'sw:cache-cleared' }))
    )
  }
})

self.addEventListener('push', (event: PushEvent) => {
  let data: Record<string, unknown> | undefined
  try {
    data = event.data?.json?.() as Record<string, unknown> | undefined
  } catch {
    data = undefined
  }
  const type = typeof data?.type === 'string' ? data.type : ''
  if (type === 'server:online') {
    event.waitUntil(
      (async () => {
        await flushOutbox('server-online')
        await broadcastMessage({ type: 'sw:status', online: true, source: 'push' })
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const hasVisibleClient = clients.some((client) => {
          const windowClient = client as WindowClient
          return windowClient.focused || windowClient.visibilityState === 'visible'
        })
        if (clients.length && hasVisibleClient) return
        const title = typeof data?.title === 'string' ? data.title : 'Fragment Prime is back online'
        const body = typeof data?.body === 'string' ? data.body : 'Open Fragment Prime to reconnect.'
        const url = typeof data?.url === 'string' ? data.url : '/'
        await self.registration.showNotification(title, {
          body,
          data: { url },
          tag: 'server-online',
          silent: true
        })
      })()
    )
    return
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

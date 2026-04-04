/// <reference lib="webworker" />
import { templateBranding } from '@prometheus/template-config'
import {
  probeServerHealth,
  SERVER_HEALTH_INTERVAL_MS,
  SERVER_HEALTH_PERIODIC_SYNC_TAG,
  type ServerHealthResult,
  type ServerHealthSource,
  shouldProbeServerHealth
} from './shared/server-health'
import {
  type ResidentNotificationRecord,
  buildResidentNotificationTag,
  resolveResidentNotificationDeliveryMode
} from './shared/resident-notifications'

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision?: string | null })[]
}

type SyncEventLike = ExtendableEvent & {
  tag: string
}

type PeriodicSyncEventLike = ExtendableEvent & {
  tag: string
}

type NotificationTriggerCapableGlobal = ServiceWorkerGlobalScope & {
  TimestampTrigger?: new (timestamp: number) => unknown
}

type NotificationOptionsWithTrigger = NotificationOptions & {
  showTrigger?: unknown
}

const CACHE_PREFIX = templateBranding.ids.cachePrefix
const PUBLIC_SHELL_CACHE_NAME = `${CACHE_PREFIX}-public-shell-v4`
const PUBLIC_DATA_CACHE_NAME = `${CACHE_PREFIX}-public-data-v1`
const USER_SHELL_CACHE_PREFIX = `${CACHE_PREFIX}-user-shell-v4`
const USER_DATA_CACHE_PREFIX = `${CACHE_PREFIX}-user-data-v1`
const OUTBOX_CACHE_NAME = `${CACHE_PREFIX}-outbox-v1`
const ACTIVE_USER_RESOURCE_KEY = 'meta:active-user'
const MANUAL_REFRESH_HEADER = 'x-prometheus-manual-refresh'
const SERVER_HEALTH_HEADER = 'x-prometheus-health-check'
const scopeUrl = new URL(self.registration.scope)
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`
const SHELL_URL = new URL('./', scopeUrl).toString()
const OFFLINE_FALLBACK_URL = new URL('./offline/', scopeUrl).toString()
const SERVER_HEALTH_URL = new URL('./api/health', scopeUrl).toString()
const SERVER_HEALTH_KEY = scopeUrl.host || null
const FRAGMENT_STREAM_PATH = '/fragments/stream'
const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image', 'worker', 'manifest'])
const STATIC_EXTENSIONS = /\.(css|js|mjs|cjs|json|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp|avif|txt|mp4|webm)$/i
const HASHED_BUILD_ASSET = /\/build\/.*(?:[.-][a-f0-9]{8,})\./i
const HTML_ASSET_PATH = /(?:^\/(?:build|assets)\/)|(?:manifest\.webmanifest$)|(?:favicon\.)|(?:apple-touch-icon)|(?:icon-.*\.png$)/i
const OUTBOX_SYNC_TAG = 'p2p-outbox'
const STORE_CART_SYNC_TAG = 'store-cart-queue'
const INVITE_QUEUE_SYNC_TAG = 'contact-invites-queue'
const PUBLIC_ROUTE_PATHS = new Set(['/', '/store', '/login', '/lab', '/offline', '/privacy'])
const AUTH_ROUTE_PATHS = new Set(['/profile', '/settings', '/dashboard', '/chat'])

const normalizePathname = (pathname: string) => {
  if (!pathname || pathname === '/') return '/'
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

const scopedPathname = (url: URL) => {
  if (scopePath === '/' || !url.pathname.startsWith(scopePath)) return normalizePathname(url.pathname)
  return normalizePathname(`/${url.pathname.slice(scopePath.length)}`)
}

const isPublicRoutePath = (pathname: string) => PUBLIC_ROUTE_PATHS.has(normalizePathname(pathname))

const isAuthRoutePath = (pathname: string) => AUTH_ROUTE_PATHS.has(normalizePathname(pathname))

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

const isFragmentStreamPath = (url: URL) =>
  url.pathname === `${scopePath}fragments/stream` || url.pathname.endsWith(FRAGMENT_STREAM_PATH)

const isFragmentPlanPath = (url: URL) => scopedPathname(url) === '/fragments/plan'

const isFragmentBatchPath = (url: URL) => scopedPathname(url) === '/fragments/batch'

const isStoreCachePath = (url: URL) => {
  const pathname = scopedPathname(url)
  const normalized = pathname.startsWith('/api/') ? pathname.slice(4) : pathname
  return normalized.startsWith('/store/items') || normalized.startsWith('/store/search')
}

const isJsonRequest = (request: Request, url: URL) => {
  if (request.method !== 'GET') return false
  if (url.origin !== self.location.origin) return false
  if (isFragmentStreamPath(url)) return false
  if (isStoreCachePath(url)) return true
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('application/json') || url.pathname.endsWith('.json')
}

const getUserShellCacheName = (userCacheKey: string) => `${USER_SHELL_CACHE_PREFIX}:${userCacheKey}`

const getUserDataCacheName = (userCacheKey: string) => `${USER_DATA_CACHE_PREFIX}:${userCacheKey}`

const buildResourceRequest = (resourceKey: string) =>
  new Request(new URL(`./__sw/resource/${encodeURIComponent(resourceKey)}`, scopeUrl).toString())

const buildResourceKey = (url: URL) => {
  const pathname = scopedPathname(url)
  if (isPublicRoutePath(pathname) || isAuthRoutePath(pathname)) {
    return `route:${pathname}`
  }
  if (pathname === '/auth/session' || pathname === '/api/auth/get-session') {
    return 'data:auth-session'
  }
  if (isStoreCachePath(url)) {
    return 'data:store-items'
  }
  if (isFragmentPlanPath(url)) {
    return `data:fragment-plan:${pathname}`
  }
  if (isFragmentBatchPath(url)) {
    return `data:fragment-batch:${pathname}`
  }
  return `asset:${url.pathname}${url.search}`
}

const isCacheableResponse = (response?: Response) =>
  Boolean(response && response.ok && (response.type === 'basic' || response.type === 'default'))

const readJsonResponse = async <T>(response: Response | undefined) => {
  if (!response) return null
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

const manifestEntryUrl = (entry: string | { url: string; revision?: string | null }) =>
  typeof entry === 'string' ? entry : entry.url

const precacheEntries = Array.isArray(self.__SW_MANIFEST) ? self.__SW_MANIFEST : []

const precacheAsset = async (cache: Cache, entry: string | { url: string; revision?: string | null }) => {
  const request = new Request(new URL(manifestEntryUrl(entry), scopeUrl).toString(), {
    credentials: 'same-origin'
  })
  try {
    const response = await fetch(request)
    if (!isCacheableResponse(response)) return
    await cache.put(request, response.clone())
  } catch {
    // Ignore install-time precache misses and let runtime caching recover them later.
  }
}

const installPrecache = async () => {
  const cache = await caches.open(PUBLIC_SHELL_CACHE_NAME)
  await Promise.all(precacheEntries.map((entry) => precacheAsset(cache, entry)))
}

const getActiveUserCacheKey = async () => {
  const cache = await caches.open(PUBLIC_DATA_CACHE_NAME)
  const response = await cache.match(buildResourceRequest(ACTIVE_USER_RESOURCE_KEY))
  const payload = await readJsonResponse<{ userCacheKey?: string | null }>(response)
  const userCacheKey = payload?.userCacheKey
  return typeof userCacheKey === 'string' && userCacheKey.trim() ? userCacheKey.trim() : null
}

const setActiveUserCacheKey = async (userCacheKey: string | null) => {
  const cache = await caches.open(PUBLIC_DATA_CACHE_NAME)
  await cache.put(
    buildResourceRequest(ACTIVE_USER_RESOURCE_KEY),
    new Response(JSON.stringify({ userCacheKey }), {
      headers: { 'content-type': 'application/json; charset=utf-8' }
    })
  )
}

const cacheResponseWithResourceKey = async ({
  cacheName,
  request,
  response,
  resourceKey
}: {
  cacheName: string
  request: Request
  response: Response
  resourceKey: string
}) => {
  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
  await cache.put(buildResourceRequest(resourceKey), response.clone())
}

const resolveShellCacheNameForUrl = async (url: URL) => {
  if (isAuthRoutePath(scopedPathname(url))) {
    const userCacheKey = await getActiveUserCacheKey()
    if (userCacheKey) return getUserShellCacheName(userCacheKey)
  }
  return PUBLIC_SHELL_CACHE_NAME
}

const resolveDataCacheNameForUrl = async (url: URL) => {
  if (isAuthRoutePath(scopedPathname(url)) || scopedPathname(url).startsWith('/auth/')) {
    const userCacheKey = await getActiveUserCacheKey()
    if (userCacheKey) return getUserDataCacheName(userCacheKey)
  }
  return PUBLIC_DATA_CACHE_NAME
}

const extractHtmlWarmupUrls = (html: string, baseUrl: URL) => {
  const matches = new Set<string>()
  const pattern = /\b(?:src|href)=["']([^"'#]+)["']/gi
  let match: RegExpExecArray | null = null
  while ((match = pattern.exec(html)) !== null) {
    try {
      const candidate = new URL(match[1], baseUrl)
      if (candidate.origin !== self.location.origin) continue
      if (!HTML_ASSET_PATH.test(candidate.pathname)) continue
      matches.add(candidate.toString())
    } catch {
      // Ignore invalid asset references.
    }
  }
  matches.add(new URL('./manifest.webmanifest', scopeUrl).toString())
  matches.add(new URL('./favicon.svg', scopeUrl).toString())
  matches.add(new URL('./favicon.ico', scopeUrl).toString())
  return Array.from(matches)
}

const broadcastMessage = async (message: Record<string, unknown>) => {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(clients.map((client: Client) => client.postMessage(message)))
}

let lastServerHealthStatus: ServerHealthResult | null = null
let serverHealthCheckPromise: Promise<ServerHealthResult> | null = null
const residentNotificationStates = new Map<
  string,
  {
    deliveredAt: number | null
    updatedAt: number
  }
>()

const isResidentNotificationRecord = (value: unknown): value is ResidentNotificationRecord => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.notificationKey === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.body === 'string' &&
    typeof candidate.updatedAt === 'number' &&
    typeof candidate.residentKey === 'string' &&
    typeof candidate.scopeKey === 'string'
  )
}

const buildResidentNotificationData = (record: ResidentNotificationRecord) => ({
  notificationId: record.id,
  url: record.url ?? '/'
})

const getResidentNotificationTag = (record: ResidentNotificationRecord) =>
  buildResidentNotificationTag(record.id)

const buildResidentNotificationTrigger = (deliverAtMs: number) => {
  const triggerCtor = (self as NotificationTriggerCapableGlobal).TimestampTrigger
  if (typeof triggerCtor !== 'function') {
    return null
  }
  try {
    return new triggerCtor(deliverAtMs)
  } catch {
    return null
  }
}

const broadcastResidentNotificationDelivered = async (
  record: ResidentNotificationRecord,
  deliveredAt: number
) => {
  await broadcastMessage({
    type: 'sw:resident-notification-delivered',
    notificationId: record.id,
    updatedAt: record.updatedAt,
    deliveredAt
  })
}

const closeResidentNotifications = async (tag: string) => {
  const notifications = await self.registration.getNotifications({ tag })
  notifications.forEach((notification) => {
    notification.close()
  })
}

const showResidentNotificationNow = async (
  record: ResidentNotificationRecord,
  deliveredAt = Date.now()
) => {
  const tag = getResidentNotificationTag(record)
  await closeResidentNotifications(tag)
  await self.registration.showNotification(record.title, {
    body: record.body,
    data: buildResidentNotificationData(record),
    tag,
    requireInteraction: false,
    silent: false
  })
  residentNotificationStates.set(record.id, {
    deliveredAt,
    updatedAt: record.updatedAt
  })
  await broadcastResidentNotificationDelivered(record, deliveredAt)
}

const deferResidentNotification = async (record: ResidentNotificationRecord) => {
  const tag = getResidentNotificationTag(record)
  await closeResidentNotifications(tag)
  residentNotificationStates.set(record.id, {
    deliveredAt: null,
    updatedAt: record.updatedAt
  })
}

const upsertResidentNotification = async (
  record: ResidentNotificationRecord,
  options: {
    deliverNow?: boolean
  } = {}
) => {
  const current = residentNotificationStates.get(record.id)
  if (current && current.updatedAt > record.updatedAt) {
    return
  }
  if (current && current.updatedAt === record.updatedAt && current.deliveredAt !== null) {
    return
  }

  const deliverAtMs =
    record.kind === 'scheduled' && typeof record.deliverAtMs === 'number' ? record.deliverAtMs : null
  const showTrigger = deliverAtMs !== null ? buildResidentNotificationTrigger(deliverAtMs) : null
  const deliveryMode = resolveResidentNotificationDeliveryMode({
    kind: record.kind,
    deliverAtMs,
    deliverNow: options.deliverNow === true,
    nowMs: Date.now(),
    supportsTrigger: showTrigger !== null
  })

  if (deliveryMode === 'schedule-trigger' && showTrigger) {
    const tag = getResidentNotificationTag(record)
    await closeResidentNotifications(tag)
    await self.registration.showNotification(record.title, {
      body: record.body,
      data: buildResidentNotificationData(record),
      tag,
      requireInteraction: false,
      silent: false,
      showTrigger
    } as NotificationOptionsWithTrigger)
    residentNotificationStates.set(record.id, {
      deliveredAt: null,
      updatedAt: record.updatedAt
    })
    return
  }

  if (deliveryMode === 'pending') {
    await deferResidentNotification(record)
    return
  }

  await showResidentNotificationNow(record)
}

const clearResidentNotification = async (notificationId: string, tag: string) => {
  residentNotificationStates.delete(notificationId)
  await closeResidentNotifications(tag)
}

const broadcastServerHealthStatus = async (
  status: ServerHealthResult,
  source: ServerHealthSource = status.source
) => {
  await broadcastMessage({
    type: 'sw:status',
    online: status.online,
    checkedAt: status.checkedAt,
    key: status.key,
    source
  })
}

const checkServerHealth = async (source: ServerHealthSource) => {
  if (serverHealthCheckPromise) return serverHealthCheckPromise

  if (
    lastServerHealthStatus &&
    !shouldProbeServerHealth(lastServerHealthStatus.checkedAt, Date.now(), SERVER_HEALTH_INTERVAL_MS)
  ) {
    await broadcastServerHealthStatus(lastServerHealthStatus, source)
    return lastServerHealthStatus
  }

  serverHealthCheckPromise = probeServerHealth({
    fetchImpl: fetch,
    url: SERVER_HEALTH_URL,
    key: SERVER_HEALTH_KEY,
    source,
    headers: {
      [SERVER_HEALTH_HEADER]: '1'
    }
  }).then(async (status) => {
    lastServerHealthStatus = status
    await broadcastServerHealthStatus(status)
    return status
  }).finally(() => {
    serverHealthCheckPromise = null
  })

  return serverHealthCheckPromise
}

const clearRuntimeCaches = async () => {
  const keys = await caches.keys()
  const targets = keys.filter(
    (key) =>
      key.startsWith(`${CACHE_PREFIX}-public-shell`) ||
      key.startsWith(`${CACHE_PREFIX}-public-data`) ||
      key.startsWith(`${CACHE_PREFIX}-user-shell`) ||
      key.startsWith(`${CACHE_PREFIX}-user-data`) ||
      key.startsWith(OUTBOX_CACHE_NAME)
  )
  await Promise.all(targets.map((key) => caches.delete(key)))
}

const deleteStaleShellCaches = async () => {
  const keys = await caches.keys()
  const targets = keys.filter((key) => {
    if (key === PUBLIC_SHELL_CACHE_NAME) {
      return false
    }
    if (key.startsWith(USER_SHELL_CACHE_PREFIX)) {
      return false
    }
    return (
      key.startsWith(`${CACHE_PREFIX}-public-shell-`) ||
      key.startsWith(`${CACHE_PREFIX}-user-shell-`)
    )
  })
  await Promise.all(targets.map((key) => caches.delete(key)))
}

const deleteUserCaches = async (userCacheKey: string | null) => {
  if (!userCacheKey) return
  await Promise.all([
    caches.delete(getUserShellCacheName(userCacheKey)),
    caches.delete(getUserDataCacheName(userCacheKey))
  ])
}

const handleNavigationRequest = async (request: Request) => {
  const requestUrl = new URL(request.url)
  const cache = await caches.open(await resolveShellCacheNameForUrl(requestUrl))
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (isCacheableResponse(response)) {
      await cacheResponseWithResourceKey({
        cacheName: await resolveShellCacheNameForUrl(requestUrl),
        request,
        response,
        resourceKey: buildResourceKey(requestUrl)
      })
    }
    return response
  } catch {
    const fallback = await cache.match(OFFLINE_FALLBACK_URL)
    if (fallback) return fallback
    const shell = await cache.match(SHELL_URL)
    if (shell) return shell
    const publicShell = await caches.open(PUBLIC_SHELL_CACHE_NAME)
    const publicFallback = await publicShell.match(OFFLINE_FALLBACK_URL)
    if (publicFallback) return publicFallback
    return Response.error()
  }
}

const handleJsonRequest = async (request: Request, url: URL) => {
  const cacheName = await resolveDataCacheNameForUrl(url)
  const cache = await caches.open(cacheName)
  const manualRefresh = request.headers.get(MANUAL_REFRESH_HEADER) === '1'
  if (!manualRefresh) {
    const cached = await cache.match(request)
    if (cached) return cached
  }

  try {
    const response = await fetch(request)
    if (isCacheableResponse(response) && (response.headers.get('content-type') ?? '').includes('application/json')) {
      await cacheResponseWithResourceKey({
        cacheName,
        request,
        response,
        resourceKey: buildResourceKey(url)
      })
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return Response.error()
  }
}

const handleStaticAssetRequest = async (request: Request, url: URL) => {
  const cache = await caches.open(PUBLIC_SHELL_CACHE_NAME)
  const manualRefresh = request.headers.get(MANUAL_REFRESH_HEADER) === '1'
  if (!manualRefresh) {
    const cached = await cache.match(request)
    if (cached) return cached
  }

  try {
    const response = await fetch(request)
    if (isCacheableResponse(response)) {
      await cacheResponseWithResourceKey({
        cacheName: PUBLIC_SHELL_CACHE_NAME,
        request,
        response,
        resourceKey: buildResourceKey(url)
      })
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    const shell = await cache.match(SHELL_URL)
    if (shell) return shell
    return Response.error()
  }
}

const warmAsset = async ({ href, cacheName, force = false }: { href: string; cacheName: string; force?: boolean }) => {
  const cache = await caches.open(cacheName)
  const request = new Request(href, {
    credentials: 'include',
    headers: force ? { [MANUAL_REFRESH_HEADER]: '1' } : undefined
  })
  if (!force) {
    const cached = await cache.match(request)
    if (cached) return
  }
  const response = await fetch(request)
  if (!isCacheableResponse(response)) return
  await cacheResponseWithResourceKey({
    cacheName,
    request,
    response,
    resourceKey: buildResourceKey(new URL(href))
  })
}

const warmDocumentAndAssets = async ({
  href,
  cacheName,
  force = false
}: {
  href: string
  cacheName: string
  force?: boolean
}) => {
  const request = new Request(href, {
    credentials: 'include',
    headers: force ? { [MANUAL_REFRESH_HEADER]: '1' } : undefined
  })
  const cache = await caches.open(cacheName)
  if (!force) {
    const cached = await cache.match(request)
    if (cached) return
  }
  const response = await fetch(request)
  if (!isCacheableResponse(response)) return
  await cacheResponseWithResourceKey({
    cacheName,
    request,
    response,
    resourceKey: buildResourceKey(new URL(href))
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) return
  const html = await response.clone().text()
  await Promise.all(
    extractHtmlWarmupUrls(html, new URL(href)).map((assetHref) =>
      warmAsset({ href: assetHref, cacheName, force })
    )
  )
}

const normalizeWarmHrefs = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => new URL(entry, scopeUrl).toString())
    : []

const warmRoutes = async ({
  hrefs,
  cacheName,
  force = false
}: {
  hrefs: string[]
  cacheName: string
  force?: boolean
}) => {
  await Promise.all(
    hrefs.map(async (href) => {
      try {
        await warmDocumentAndAssets({ href, cacheName, force })
      } catch {
        // Ignore individual warmup failures.
      }
    })
  )
}

const updateResource = async ({
  resourceKey,
  url,
  userCacheKey,
  body,
  contentType
}: {
  resourceKey: string
  url?: string | null
  userCacheKey?: string | null
  body?: unknown
  contentType?: string | null
}) => {
  const cacheName =
    userCacheKey && resourceKey.startsWith('route:')
      ? getUserShellCacheName(userCacheKey)
      : userCacheKey
        ? getUserDataCacheName(userCacheKey)
        : resourceKey.startsWith('route:') || resourceKey.startsWith('asset:')
          ? PUBLIC_SHELL_CACHE_NAME
          : PUBLIC_DATA_CACHE_NAME
  const cache = await caches.open(cacheName)
  const resourceRequest = buildResourceRequest(resourceKey)

  if (typeof body !== 'undefined') {
    const response = new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      {
        headers: {
          'content-type': contentType ?? 'application/json; charset=utf-8'
        }
      }
    )
    await cache.put(resourceRequest, response.clone())
    if (url) {
      await cache.put(new Request(url), response.clone())
    }
    await broadcastMessage({ type: 'sw:resource-updated', resourceKey, url, userCacheKey, body, contentType })
    return
  }

  if (!url) return
  const request = new Request(url, {
    credentials: 'include',
    headers: { [MANUAL_REFRESH_HEADER]: '1' }
  })
  const response = await fetch(request)
  if (!isCacheableResponse(response)) return
  await cache.put(request, response.clone())
  await cache.put(resourceRequest, response.clone())
  await broadcastMessage({
    type: 'sw:resource-updated',
    resourceKey,
    url,
    userCacheKey,
    contentType: response.headers.get('content-type') ?? null
  })
}

const invalidateResource = async ({
  resourceKey,
  url,
  userCacheKey
}: {
  resourceKey: string
  url?: string | null
  userCacheKey?: string | null
}) => {
  const cacheName =
    userCacheKey && resourceKey.startsWith('route:')
      ? getUserShellCacheName(userCacheKey)
      : userCacheKey
        ? getUserDataCacheName(userCacheKey)
        : resourceKey.startsWith('route:') || resourceKey.startsWith('asset:')
          ? PUBLIC_SHELL_CACHE_NAME
          : PUBLIC_DATA_CACHE_NAME
  const cache = await caches.open(cacheName)
  await cache.delete(buildResourceRequest(resourceKey))
  if (url) {
    await cache.delete(new Request(url))
  }
  await broadcastMessage({ type: 'sw:resource-invalidated', resourceKey, url, userCacheKey })
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      installPrecache()
    ])
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      deleteStaleShellCaches(),
      self.clients.claim()
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (request.headers.get(SERVER_HEALTH_HEADER) === '1') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isFragmentStreamPath(url)) return

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigationRequest(request))
    return
  }

  if (isFragmentPlanPath(url) || isFragmentBatchPath(url) || isJsonRequest(request, url)) {
    event.respondWith(handleJsonRequest(request, url))
    return
  }

  if (isHashedBuildAssetRequest(request, url) || isStaticAssetRequest(request, url)) {
    event.respondWith(handleStaticAssetRequest(request, url))
  }
})

self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEventLike
  if (syncEvent.tag === OUTBOX_SYNC_TAG) {
    syncEvent.waitUntil(flushOutbox('sync'))
    return
  }
  if (syncEvent.tag === STORE_CART_SYNC_TAG) {
    syncEvent.waitUntil(flushStoreCartQueue('sync'))
    return
  }
  if (syncEvent.tag === INVITE_QUEUE_SYNC_TAG) {
    syncEvent.waitUntil(flushContactInviteQueue('sync'))
  }
})

self.addEventListener('periodicsync' as never, ((event: ExtendableEvent) => {
  const periodicSyncEvent = event as PeriodicSyncEventLike
  if (periodicSyncEvent.tag === SERVER_HEALTH_PERIODIC_SYNC_TAG) {
    periodicSyncEvent.waitUntil(checkServerHealth('periodic-sync').then(() => undefined))
  }
}) as EventListener)

self.addEventListener('message', (event) => {
  const payload = event.data as Record<string, unknown> | null
  if (!payload || typeof payload.type !== 'string') return

  if (payload.type === 'store:cart:flush') {
    event.waitUntil(flushStoreCartQueue('message'))
    return
  }

  if (payload.type === 'contact-invites:flush-queue') {
    event.waitUntil(flushContactInviteQueue('message'))
    return
  }

  if (payload.type === 'p2p:flush-outbox') {
    const reason = typeof payload.reason === 'string' ? payload.reason : 'manual'
    event.waitUntil(flushOutbox(reason))
    return
  }

  if (payload.type === 'sw:clear-user-cache') {
    event.waitUntil(
      (async () => {
        const activeUserCacheKey = await getActiveUserCacheKey()
        await deleteUserCaches(activeUserCacheKey)
        await setActiveUserCacheKey(null)
        await broadcastMessage({ type: 'sw:cache-cleared', scope: 'user', userCacheKey: activeUserCacheKey })
      })()
    )
    return
  }

  if (payload.type === 'sw:refresh-cache') {
    event.waitUntil(
      clearRuntimeCaches().then(() => broadcastMessage({ type: 'sw:cache-refreshed' }))
    )
    return
  }

  if (payload.type === 'sw:clear-cache') {
    event.waitUntil(
      (async () => {
        const activeUserCacheKey = await getActiveUserCacheKey()
        await clearRuntimeCaches()
        await deleteUserCaches(activeUserCacheKey)
        await setActiveUserCacheKey(null)
        await broadcastMessage({ type: 'sw:cache-cleared', userCacheKey: activeUserCacheKey })
      })()
    )
    return
  }

  if (payload.type === 'sw:warm-public') {
    const hrefs = normalizeWarmHrefs(payload.hrefs)
    event.waitUntil(
      warmRoutes({ hrefs, cacheName: PUBLIC_SHELL_CACHE_NAME }).then(() =>
        broadcastMessage({ type: 'sw:warm-complete', audience: 'public', count: hrefs.length })
      )
    )
    return
  }

  if (payload.type === 'sw:warm-user') {
    const hrefs = normalizeWarmHrefs(payload.hrefs)
    const userCacheKey = typeof payload.userCacheKey === 'string' ? payload.userCacheKey.trim() : ''
    if (!userCacheKey) return
    event.waitUntil(
      setActiveUserCacheKey(userCacheKey)
        .then(() => warmRoutes({ hrefs, cacheName: getUserShellCacheName(userCacheKey) }))
        .then(() =>
          broadcastMessage({
            type: 'sw:warm-complete',
            audience: 'auth',
            count: hrefs.length,
            userCacheKey
          })
        )
    )
    return
  }

  if (payload.type === 'sw:manual-refresh') {
    const publicHrefs = normalizeWarmHrefs(payload.publicHrefs)
    const authHrefs = normalizeWarmHrefs(payload.authHrefs)
    const userCacheKey = typeof payload.userCacheKey === 'string' ? payload.userCacheKey.trim() : ''
    event.waitUntil(
      Promise.all([
        warmRoutes({ hrefs: publicHrefs, cacheName: PUBLIC_SHELL_CACHE_NAME, force: true }),
        userCacheKey
          ? setActiveUserCacheKey(userCacheKey).then(() =>
              warmRoutes({
                hrefs: authHrefs,
                cacheName: getUserShellCacheName(userCacheKey),
                force: true
              })
            )
          : Promise.resolve()
      ]).then(() => broadcastMessage({ type: 'sw:cache-refreshed', source: 'manual-refresh' }))
    )
    return
  }

  if (payload.type === 'sw:check-server-health') {
    const reason =
      typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : 'heartbeat'
    event.waitUntil(checkServerHealth(reason))
    return
  }

  if (payload.type === 'sw:update-resource' && typeof payload.resourceKey === 'string') {
    event.waitUntil(
      updateResource({
        resourceKey: payload.resourceKey,
        url: typeof payload.url === 'string' ? payload.url : null,
        userCacheKey: typeof payload.userCacheKey === 'string' ? payload.userCacheKey : null,
        body: payload.body,
        contentType: typeof payload.contentType === 'string' ? payload.contentType : null
      })
    )
    return
  }

  if (payload.type === 'sw:invalidate-resource' && typeof payload.resourceKey === 'string') {
    event.waitUntil(
      invalidateResource({
        resourceKey: payload.resourceKey,
        url: typeof payload.url === 'string' ? payload.url : null,
        userCacheKey: typeof payload.userCacheKey === 'string' ? payload.userCacheKey : null
      })
    )
    return
  }

  if (payload.type === 'sw:resident-notification-upsert' && isResidentNotificationRecord(payload.notification)) {
    event.waitUntil(
      upsertResidentNotification(payload.notification, {
        deliverNow: payload.deliverNow === true
      })
    )
    return
  }

  if (
    payload.type === 'sw:resident-notification-clear' &&
    typeof payload.notificationId === 'string' &&
    typeof payload.tag === 'string'
  ) {
    event.waitUntil(clearResidentNotification(payload.notificationId, payload.tag))
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
        lastServerHealthStatus = {
          online: true,
          checkedAt: Date.now(),
          key: SERVER_HEALTH_KEY,
          source: 'push'
        }
        await broadcastServerHealthStatus(lastServerHealthStatus)
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const hasVisibleClient = clients.some((client) => {
          const windowClient = client as WindowClient
          return windowClient.focused || windowClient.visibilityState === 'visible'
        })
        if (clients.length && hasVisibleClient) return
        const title =
          typeof data?.title === 'string' ? data.title : templateBranding.notifications.onlineTitle
        const body =
          typeof data?.body === 'string' ? data.body : templateBranding.notifications.onlineBody
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

  if (type === 'sw:update-resource' && typeof data?.resourceKey === 'string') {
    event.waitUntil(
      updateResource({
        resourceKey: data.resourceKey,
        url: typeof data.url === 'string' ? data.url : null,
        userCacheKey: typeof data.userCacheKey === 'string' ? data.userCacheKey : null,
        body: data.body,
        contentType: typeof data.contentType === 'string' ? data.contentType : null
      })
    )
    return
  }

  if (type === 'sw:invalidate-resource' && typeof data?.resourceKey === 'string') {
    event.waitUntil(
      invalidateResource({
        resourceKey: data.resourceKey,
        url: typeof data.url === 'string' ? data.url : null,
        userCacheKey: typeof data.userCacheKey === 'string' ? data.userCacheKey : null
      })
    )
    return
  }

  const title = typeof data?.title === 'string' ? data.title : 'New message'
  const body = typeof data?.body === 'string' ? data.body : templateBranding.notifications.syncBody
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
  const notificationData = event.notification.data as
    | {
        notificationId?: string
        url?: string
      }
    | undefined
  const notificationId = typeof notificationData?.notificationId === 'string' ? notificationData.notificationId : null
  if (notificationId) {
    residentNotificationStates.delete(notificationId)
  }
  event.notification.close()
  const targetUrl = typeof notificationData?.url === 'string' ? notificationData.url : '/'
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

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  const notificationData = event.notification.data as
    | {
        notificationId?: string
      }
    | undefined
  const notificationId = typeof notificationData?.notificationId === 'string' ? notificationData.notificationId : null
  if (!notificationId) {
    return
  }
  const state = residentNotificationStates.get(notificationId)
  if (!state) {
    return
  }
  residentNotificationStates.set(notificationId, {
    ...state,
    deliveredAt: state.deliveredAt ?? Date.now()
  })
  event.waitUntil(
    broadcastMessage({
      type: 'sw:resident-notification-delivered',
      notificationId,
      updatedAt: state.updatedAt,
      deliveredAt: state.deliveredAt ?? Date.now()
    })
  )
})

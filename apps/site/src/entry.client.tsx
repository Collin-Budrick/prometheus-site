import type { RenderOptions } from '@builder.io/qwik'
import { getServerBackoffMs, markServerFailure, markServerSuccess } from './shared/server-backoff'
import { resolvePublicApiHost } from './shared/public-api-url'
import { asTrustedScriptUrl } from './security/client'
import { appConfig } from './site-config'
import {
  CLEANUP_VERSION_KEY,
  FORCE_CLEANUP_KEY,
  OPT_OUT_KEY,
  readServiceWorkerSeedFromDocument,
  writeServiceWorkerCleanupVersionCookie,
  writeServiceWorkerOptOutCookie
} from './shared/service-worker-seed'
import { runAfterClientIntent, runAfterClientIntentIdle } from './shared/client-boot'
import { initConnectivityStore, isOnline } from './native/connectivity'
import { isNativeShellRuntime } from './native/runtime'
import { createRouteFragmentWarmupManager } from './fragment/route-warmup'
import { fragmentPlanCache } from './fragment/plan-cache'
import {
  ROUTE_WARMUP_STATE_KEY,
  buildUserFragmentCacheScope,
  resolveFragmentCacheScope,
  resolveCurrentFragmentCacheScope
} from './fragment/cache-scope'
import { getPersistentRuntimeCache } from './fragment/runtime/persistent-cache-instance'
import { parseFragmentPayloadResourceKey } from './fragment/runtime/resource-keys'
import type { FragmentPayload } from './fragment/types'
import {
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_ISLAND_DATA_SCRIPT_ID,
  STATIC_PAGE_ROOT_ATTR,
  STATIC_ROUTE_ATTR
} from './shell/core/constants'

declare global {
  interface Window {
    __FRAGMENT_PRIME_DISABLE_SW__?: boolean
    __FRAGMENT_PRIME_FORCE_SW_CLEANUP__?: boolean
  }
}

const OUTBOX_SYNC_TAG = 'p2p-outbox'
const pwaEnabled = appConfig.template.features.pwa
const serviceWorkerSeed = readServiceWorkerSeedFromDocument()
type BackgroundSyncRegistration = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>
  }
}

type StaticRouteBootstrapKind = 'home' | 'fragment' | 'island'
type RouteWarmupWindow = Window & typeof globalThis & {
  [ROUTE_WARMUP_STATE_KEY]?: {
    publicHrefs?: string[]
    authHrefs?: string[]
    isAuthenticated?: boolean
    userCacheKey?: string | null
  }
}

const resolveStaticRouteBootstrapKind = () => {
  if (typeof document === 'undefined') return null
  const routeRoot = document.querySelector<HTMLElement>(`[${STATIC_ROUTE_ATTR}]`)
  const routeKind = routeRoot?.getAttribute(STATIC_ROUTE_ATTR)
  if (routeKind === 'home' || routeKind === 'fragment' || routeKind === 'island') {
    return routeKind satisfies StaticRouteBootstrapKind
  }
  if (document.getElementById(STATIC_HOME_DATA_SCRIPT_ID)) {
    return 'home' satisfies StaticRouteBootstrapKind
  }
  if (document.getElementById(STATIC_FRAGMENT_DATA_SCRIPT_ID)) {
    return 'fragment' satisfies StaticRouteBootstrapKind
  }
  if (
    document.getElementById(STATIC_ISLAND_DATA_SCRIPT_ID) ||
    document.querySelector<HTMLElement>(`[${STATIC_PAGE_ROOT_ATTR}]`)
  ) {
    return 'island' satisfies StaticRouteBootstrapKind
  }
  return null
}

const loadStaticRouteBootstrap = (kind: StaticRouteBootstrapKind) => {
  switch (kind) {
    case 'fragment':
      return import('./shell/fragments/fragment-static-entry')
    case 'island':
      return import('./shell/core/island-static-entry')
    case 'home':
    default:
      return import('./shell/home/home-static-entry')
  }
}

const bootstrapStaticRouteShell = (
  hasStaticOnlyRoute: boolean,
  onBootstrapFailure: () => void
) => {
  const kind = resolveStaticRouteBootstrapKind()
  if (!kind) return

  void loadStaticRouteBootstrap(kind).catch((error) => {
    console.error('Static shell bootstrap failed.', error)
    if (hasStaticOnlyRoute) {
      onBootstrapFailure()
    }
  })
}

const initNativeFeelTelemetryDeferred = async () => {
  const telemetry = await import('./native/telemetry')
  telemetry.initNativeFeelTelemetry()
}

const dispatchSwEvent = (name: string, detail?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

const persistentFragmentRuntimeCache = getPersistentRuntimeCache()
let fragmentWarmupManager: ReturnType<typeof createRouteFragmentWarmupManager> | null = null

const getFragmentWarmupManager = () => {
  fragmentWarmupManager ??= createRouteFragmentWarmupManager({
    payloadCache: persistentFragmentRuntimeCache
  })
  return fragmentWarmupManager
}

const buildServiceWorkerResourceUrl = (resourceKey: string) =>
  new URL(`./__sw/resource/${encodeURIComponent(resourceKey)}`, resolveServiceWorkerLocation().scopeUrl).toString()

const resolveFragmentScopeFromPayload = (payload: Record<string, unknown>, path: string) =>
  typeof payload.userCacheKey === 'string'
    ? resolveFragmentCacheScope(path, payload.userCacheKey)
    : resolveCurrentFragmentCacheScope(path)

const readFragmentPayloadFromServiceWorkerMessage = async (payload: Record<string, unknown>) => {
  const parsedKey = parseFragmentPayloadResourceKey(typeof payload.resourceKey === 'string' ? payload.resourceKey : null)
  if (!parsedKey) return null

  const readResponse = async () => {
    if (typeof payload.body !== 'undefined') {
      return new Response(
        typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body),
        {
          headers: {
            'content-type':
              typeof payload.contentType === 'string' ? payload.contentType : 'application/json; charset=utf-8'
          }
        }
      )
    }
    const resourceUrl = buildServiceWorkerResourceUrl(typeof payload.resourceKey === 'string' ? payload.resourceKey : '')
    return (await caches.match(resourceUrl)) ?? (typeof payload.url === 'string' ? await caches.match(payload.url) : null)
  }

  const response = await readResponse()
  if (!response) return null

  try {
    const nextPayload = (await response.json()) as FragmentPayload
    return {
      ...parsedKey,
      payload: nextPayload,
      scopeKey: resolveFragmentScopeFromPayload(payload, parsedKey.path)
    }
  } catch {
    return null
  }
}

const clearScopedFragmentCaches = async (scopeKey?: string | null) => {
  if (!scopeKey) {
    fragmentPlanCache.clear?.()
    await persistentFragmentRuntimeCache.clearAllPayloads()
    return
  }
  fragmentPlanCache.clearScope?.(scopeKey)
  await persistentFragmentRuntimeCache.clearPayloadScope(scopeKey)
}

const warmFragmentRoutes = (audience: 'public' | 'auth', force = false) => {
  const warmup = resolveRouteWarmupState()
  if (!warmup) return
  const hrefs = audience === 'public' ? warmup.publicHrefs ?? [] : warmup.authHrefs ?? []
  if (!hrefs.length) return
  if (audience === 'auth' && !warmup.userCacheKey) return
  getFragmentWarmupManager().warmIdleRoutes(hrefs, force ? { force: true } : undefined)
}

if (import.meta.hot) {
  import.meta.hot.on('vite:connected', () => {
    console.info('[vite] connected (https proxy)')
  })
}

export default function (opts: RenderOptions) {
  let didRenderFullApp = false
  const renderFullApp = async () => {
    if (didRenderFullApp) return
    didRenderFullApp = true
    const [{ render }, { default: Root }] = await Promise.all([import('@builder.io/qwik'), import('./root')])
    return render(document, <Root />, opts)
  }

  const hasStaticShell = typeof document !== 'undefined'
    ? Boolean(document.querySelector<HTMLElement>(`[${STATIC_ROUTE_ATTR}]`))
    : false
  const hasStaticOnlyRoute = typeof document !== 'undefined'
    ? Boolean(
        document.getElementById(STATIC_HOME_DATA_SCRIPT_ID) ||
          document.getElementById(STATIC_FRAGMENT_DATA_SCRIPT_ID) ||
          document.getElementById(STATIC_ISLAND_DATA_SCRIPT_ID) ||
          document.querySelector<HTMLElement>(`[${STATIC_PAGE_ROOT_ATTR}]`)
      )
    : false
  if (import.meta.env.DEV && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        bootstrapStaticRouteShell(hasStaticOnlyRoute, () => {
          void renderFullApp()
        })
        if (hasStaticOnlyRoute) {
          void renderFullApp()
        }
      }, { once: true })
    } else {
      bootstrapStaticRouteShell(hasStaticOnlyRoute, () => {
        void renderFullApp()
      })
      if (hasStaticOnlyRoute) {
        void renderFullApp()
      }
    }
  }

  if (!hasStaticOnlyRoute) {
    void renderFullApp()
  }
  const nativeRuntime = isNativeShellRuntime()
  const shouldBridgeServiceWorker = pwaEnabled && !nativeRuntime && 'serviceWorker' in navigator

  if (shouldBridgeServiceWorker) {
    runAfterClientIntentIdle(() => {
      setupServiceWorkerBridge()
    })
  }

  runAfterClientIntent(() => {
    void initConnectivityStore()
  })
  if (nativeRuntime) {
    runAfterClientIntentIdle(() => {
      void initNativeFeelTelemetryDeferred()
    })
  }

  runAfterClientIntentIdle(() => {
    setupWebSocketBackoffMonitor()
    setupOfflineErrorFilters()
  })

  if (!nativeRuntime && 'serviceWorker' in navigator && !pwaEnabled) {
    window.addEventListener(
      'load',
      () => {
        void clearServiceWorkerCacheAndUnregister()
      },
      { once: true }
    )
  }

  if (!nativeRuntime && import.meta.env.PROD && 'serviceWorker' in navigator && pwaEnabled) {
    window.addEventListener('load', () => {
      const shouldSkipServiceWorker = isServiceWorkerDisabled() || isServiceWorkerOptedOut()
      const shouldRunCleanup = shouldForceServiceWorkerCleanup() || !hasRunCleanupForVersion()

      const cleanupPromise = shouldRunCleanup
        ? unregisterLegacyServiceWorker()
            .then(() => unregisterActiveServiceWorker())
            .then(() => clearServiceWorkerCaches())
            .then(() => markCleanupComplete())
            .catch((error) => console.warn('Service worker cleanup failed:', error))
        : Promise.resolve()

      if (shouldSkipServiceWorker) {
        void cleanupPromise.finally(() => {
          void clearServiceWorkerCacheAndUnregister()
        })
        return
      }

      void cleanupPromise.finally(() => {
        void registerServiceWorker()
      })
    })
  }
}

function setupOfflineErrorFilters() {
  if (typeof window === 'undefined') return
  const windowHost = window.location.host
  const apiHost = resolvePublicApiHost(window.location.origin)
  const isServerOffline = () => {
    if (!isOnline()) return true
    return getServerBackoffMs(windowHost) > 0 || getServerBackoffMs(apiHost) > 0
  }
  const resolveKnownHost = (host: string) => {
    if (!host) return ''
    if (host === windowHost) return host
    if (host === apiHost) return host
    return ''
  }
  const resolveHostFromMessage = (message: string) => {
    if (!message) return ''
    const match = message.match(/(https?:\/\/[^\s'"]+|wss?:\/\/[^\s'"]+)/)
    if (!match) return ''
    try {
      return new URL(match[1]).host
    } catch (error) {
      console.warn('Failed to resolve host from message error:', error)
      return ''
    }
  }
  const resolveHostFromResource = (value: unknown) => {
    if (typeof value !== 'string') return ''
    try {
      return new URL(value, window.location.origin).host
    } catch (error) {
      console.warn('Failed to resolve host from resource URL:', error)
      return ''
    }
  }
  const isDynamicImportError = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    return message.includes('Failed to fetch dynamically imported module')
  }
  window.addEventListener('unhandledrejection', (event) => {
    if (!isDynamicImportError(event.reason)) return
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
    const host = resolveKnownHost(resolveHostFromMessage(message)) || windowHost
    markServerFailure(host, { baseDelayMs: 1000, maxDelayMs: 8000 })
    if (isServerOffline()) {
      event.preventDefault()
    }
  })
  const handleWindowError = (event: Event) => {
    if (event instanceof ErrorEvent) {
      const message = event.message
      if (!message) return
      if (message.includes('WebSocket connection to')) {
        const wsHost = resolveKnownHost(resolveHostFromMessage(message))
        if (wsHost) {
          markServerFailure(wsHost, { baseDelayMs: 3000, maxDelayMs: 120000 })
        }
      }
      if (message.includes('Failed to fetch dynamically imported module')) {
        const host = resolveKnownHost(resolveHostFromMessage(message)) || windowHost
        markServerFailure(host, { baseDelayMs: 1000, maxDelayMs: 8000 })
        if (isServerOffline()) {
          event.preventDefault()
        }
      }
      return
    }
    const target = event.target as (HTMLElement & { src?: string; href?: string }) | null
    const resourceUrl = target?.src || target?.href
    if (!resourceUrl) return
    const host = resolveKnownHost(resolveHostFromResource(resourceUrl)) || windowHost
    markServerFailure(host, { baseDelayMs: 1000, maxDelayMs: 8000 })
    if (isServerOffline()) {
      event.preventDefault()
    }
  }
  window.addEventListener('error', handleWindowError as EventListener, { capture: true })
}

function setupWebSocketBackoffMonitor() {
  if (typeof window === 'undefined') return
  const marker = '__FRAGMENT_PRIME_WS_BACKOFF__'
  const windowFlags = window as unknown as Record<string, unknown>
  if (windowFlags[marker]) return
  windowFlags[marker] = true
  if (typeof window.WebSocket !== 'function') return
  const windowHost = window.location.host
  const apiHost = resolvePublicApiHost(window.location.origin)
  const resolveKnownHost = (host: string) => {
    if (!host) return ''
    if (host === windowHost) return host
    if (host === apiHost) return host
    return ''
  }
  const resolveHostFromUrl = (value: string | URL) => {
    try {
      return resolveKnownHost(new URL(String(value), window.location.origin).host)
    } catch (error) {
      console.warn('Failed to resolve host from WebSocket URL:', error)
      return ''
    }
  }
  const NativeWebSocket = window.WebSocket
  class BackoffWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(String(url), protocols as string | string[] | undefined)
      const host = resolveHostFromUrl(url)
      if (!host) return
      this.addEventListener('open', () => {
        markServerSuccess(host)
      })
      this.addEventListener('error', () => {
        markServerFailure(host, { baseDelayMs: 3000, maxDelayMs: 120000 })
      })
      this.addEventListener('close', (event) => {
        if (event.wasClean && event.code === 1000) return
        markServerFailure(host, { baseDelayMs: 3000, maxDelayMs: 120000 })
      })
    }
  }
  window.WebSocket = BackoffWebSocket as typeof WebSocket
}

function setupServiceWorkerBridge() {
  const handleMessage = (event: MessageEvent) => {
    const payload = event.data as Record<string, unknown> | null
    if (!payload || typeof payload.type !== 'string') return
    if (payload.type === 'sw:cache-refreshed') {
      dispatchSwEvent('prom:sw-cache-refreshed', { source: 'sw' })
    }
    if (payload.type === 'sw:cache-cleared') {
      void clearScopedFragmentCaches(
        payload.scope === 'user' && typeof payload.userCacheKey === 'string'
          ? buildUserFragmentCacheScope(payload.userCacheKey)
          : null
      )
      dispatchSwEvent('prom:sw-cache-cleared', { source: 'sw' })
    }
    if (payload.type === 'sw:warm-complete') {
      dispatchSwEvent('prom:sw-warm-complete', payload)
    }
    if (payload.type === 'sw:resource-updated') {
      void (async () => {
        const nextPayload = await readFragmentPayloadFromServiceWorkerMessage(payload)
        if (!nextPayload) return
        await persistentFragmentRuntimeCache.seedPayload(
          nextPayload.scopeKey,
          nextPayload.path,
          nextPayload.lang,
          nextPayload.payload
        )
      })()
      dispatchSwEvent('prom:sw-resource-updated', payload)
    }
    if (payload.type === 'sw:resource-invalidated') {
      const parsedKey = parseFragmentPayloadResourceKey(
        typeof payload.resourceKey === 'string' ? payload.resourceKey : null
      )
      if (parsedKey) {
        void persistentFragmentRuntimeCache.invalidatePayload(
          resolveFragmentScopeFromPayload(payload, parsedKey.path),
          parsedKey.path,
          parsedKey.lang,
          parsedKey.fragmentId
        )
      }
      dispatchSwEvent('prom:sw-resource-invalidated', payload)
    }
    if (payload.type === 'sw:status') {
      if (payload.online === true) {
        markServerSuccess(resolveServerKey())
      }
      dispatchSwEvent('prom:network-status', payload)
    }
  }

  navigator.serviceWorker.addEventListener('message', handleMessage)

  window.addEventListener('online', () => {
    dispatchSwEvent('prom:network-status', { online: true })
  })
  window.addEventListener('offline', () => {
    dispatchSwEvent('prom:network-status', { online: false })
  })

  window.addEventListener('prom:sw-manual-sync', () => {
    void triggerManualSync()
  })
  window.addEventListener('prom:sw-manual-refresh', () => {
    warmFragmentRoutes('public', true)
    warmFragmentRoutes('auth', true)
    void manualRefreshServiceWorkerResources()
  })
  window.addEventListener('prom:sw-warm-public', () => {
    warmFragmentRoutes('public')
    const warmup = resolveRouteWarmupState()
    if (!warmup?.publicHrefs?.length) return
    void postServiceWorkerMessage({
      type: 'sw:warm-public',
      hrefs: warmup.publicHrefs
    })
  })
  window.addEventListener('prom:sw-warm-user', () => {
    warmFragmentRoutes('auth')
    const warmup = resolveRouteWarmupState()
    if (!warmup?.authHrefs?.length || !warmup.userCacheKey) return
    void postServiceWorkerMessage({
      type: 'sw:warm-user',
      hrefs: warmup.authHrefs,
      userCacheKey: warmup.userCacheKey
    })
  })
  window.addEventListener('prom:sw-update-resource', (event) => {
    const detail = event instanceof CustomEvent ? (event.detail as Record<string, unknown> | undefined) : undefined
    if (!detail) return
    void postServiceWorkerMessage({
      type: 'sw:update-resource',
      ...detail
    })
  })
  window.addEventListener('prom:sw-invalidate-resource', (event) => {
    const detail = event instanceof CustomEvent ? (event.detail as Record<string, unknown> | undefined) : undefined
    if (!detail) return
    void postServiceWorkerMessage({
      type: 'sw:invalidate-resource',
      ...detail
    })
  })
  window.addEventListener('prom:sw-refresh-cache', () => {
    warmFragmentRoutes('public', true)
    warmFragmentRoutes('auth', true)
    void manualRefreshServiceWorkerResources()
  })
  window.addEventListener('prom:sw-clear-cache', () => {
    void clearServiceWorkerCacheAndUnregister()
  })
  window.addEventListener('prom:sw-toggle-cache', (event) => {
    const payload = event instanceof CustomEvent ? (event.detail as { optOut?: boolean } | undefined) : undefined
    const optOut = payload?.optOut === true
    void setServiceWorkerOptOut(optOut)
  })

  const warmInitialFragments = () => {
    warmFragmentRoutes('public')
    warmFragmentRoutes('auth')
  }

  if (document.readyState === 'complete') {
    warmInitialFragments()
  } else {
    window.addEventListener('load', warmInitialFragments, { once: true })
  }
}

function resolveServerKey() {
  if (typeof window === 'undefined') return 'default'
  return resolvePublicApiHost(window.location.origin)
}

async function triggerManualSync() {
  const registration = await getActiveRegistration()
  if (!registration) return
  const syncRegistration = registration as BackgroundSyncRegistration
  if (syncRegistration.sync?.register) {
    try {
      await syncRegistration.sync.register(OUTBOX_SYNC_TAG)
      dispatchSwEvent('prom:sw-sync-requested', { method: 'sync' })
      return
    } catch (error) {
      console.warn('Background sync registration failed:', error)
    }
  }
  registration.active?.postMessage({ type: 'p2p:flush-outbox', reason: 'manual' })
  dispatchSwEvent('prom:sw-sync-requested', { method: 'message' })
}

function resolveRouteWarmupState() {
  if (typeof window === 'undefined') return null
  return (window as RouteWarmupWindow)[ROUTE_WARMUP_STATE_KEY] ?? null
}

async function postServiceWorkerMessage(message: Record<string, unknown>) {
  const registration = await getActiveRegistration()
  if (registration?.active) {
    registration.active.postMessage(message)
    return
  }
  navigator.serviceWorker.controller?.postMessage(message)
}

async function refreshServiceWorkerCache() {
  const registration = await getActiveRegistration()
  try {
    await registration?.update()
  } catch (error) {
    console.warn('Service worker update failed:', error)
  }
}

async function manualRefreshServiceWorkerResources() {
  const warmup = resolveRouteWarmupState()
  await postServiceWorkerMessage({
    type: 'sw:manual-refresh',
    publicHrefs: warmup?.publicHrefs ?? [],
    authHrefs: warmup?.authHrefs ?? [],
    userCacheKey: warmup?.userCacheKey ?? null
  })
  dispatchSwEvent('prom:sw-cache-refreshed', { source: 'window' })
  void refreshServiceWorkerCache()
}

async function clearServiceWorkerCacheAndUnregister() {
  await unregisterLegacyServiceWorker()
  await unregisterActiveServiceWorker()
  await clearServiceWorkerCaches()
  await clearScopedFragmentCaches(null)
  dispatchSwEvent('prom:sw-cache-cleared', { source: 'window' })
}

async function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (!pwaEnabled) return
  const { swUrl, scope } = resolveServiceWorkerLocation()
  try {
    const trustedSwUrl = asTrustedScriptUrl(swUrl)
    const register =
      navigator.serviceWorker.register as unknown as (
        scriptUrl: typeof trustedSwUrl,
        options?: RegistrationOptions
      ) => Promise<ServiceWorkerRegistration>
    await register.call(navigator.serviceWorker, trustedSwUrl, { scope })
  } catch (error) {
    console.error('Service worker registration failed:', error)
  }
}

  async function getActiveRegistration() {
  if (!pwaEnabled) return undefined
  const { scopeUrl } = resolveServiceWorkerLocation()
  const registration = await navigator.serviceWorker.getRegistration(scopeUrl)
  if (registration) return registration
  try {
    return await navigator.serviceWorker.ready
  } catch (error) {
    console.warn('Failed to resolve active service worker registration:', error)
    return undefined
  }
}

function getBuildVersion() {
  return (
    import.meta.env.VITE_APP_VERSION ||
    import.meta.env.VITE_COMMIT_SHA ||
    import.meta.env.VITE_BUILD_SHA ||
    import.meta.env.VERCEL_GIT_COMMIT_SHA ||
    import.meta.env.MODE ||
    'unknown'
  )
}

function isServiceWorkerDisabled() {
  if (!pwaEnabled) {
    return true
  }
  if (serviceWorkerSeed.disabled !== undefined) {
    return serviceWorkerSeed.disabled
  }
  return import.meta.env.VITE_DISABLE_SW === '1' || import.meta.env.VITE_DISABLE_SW === 'true'
}

function isServiceWorkerOptedOut() {
  if (window.__FRAGMENT_PRIME_DISABLE_SW__) return true
  if (serviceWorkerSeed.optOut !== undefined) return serviceWorkerSeed.optOut
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch (error) {
    console.warn('Service worker opt-out lookup failed:', error)
    return false
  }
}

  function shouldForceServiceWorkerCleanup() {
    try {
      if (window.__FRAGMENT_PRIME_FORCE_SW_CLEANUP__ === true) return true
      if (serviceWorkerSeed.forceCleanup !== undefined) return serviceWorkerSeed.forceCleanup
      return window.localStorage.getItem(FORCE_CLEANUP_KEY) === '1'
    } catch (error) {
      console.warn('Failed to resolve service worker cleanup flag:', error)
      return false
    }
  }

  function hasRunCleanupForVersion() {
    try {
      if (serviceWorkerSeed.cleanupVersion) {
        return serviceWorkerSeed.cleanupVersion === getBuildVersion()
      }
      return window.localStorage.getItem(CLEANUP_VERSION_KEY) === getBuildVersion()
    } catch (error) {
      console.warn('Failed to resolve service worker cleanup version:', error)
      return false
    }
  }

function markCleanupComplete() {
  try {
    window.localStorage.setItem(CLEANUP_VERSION_KEY, getBuildVersion())
  } catch (error) {
    console.warn('Service worker cleanup flag write failed:', error)
  }
  writeServiceWorkerCleanupVersionCookie(getBuildVersion())
}

async function setServiceWorkerOptOut(optOut: boolean) {
  try {
    window.localStorage.setItem(OPT_OUT_KEY, optOut ? '1' : '0')
  } catch (error) {
    console.warn('Service worker opt-out update failed:', error)
  }
  writeServiceWorkerOptOutCookie(optOut)

  if (optOut) {
    await clearServiceWorkerCacheAndUnregister()
  } else {
    if (pwaEnabled) {
      await registerServiceWorker()
      dispatchSwEvent('prom:sw-cache-refreshed', { source: 'window' })
    } else {
      await clearServiceWorkerCacheAndUnregister()
    }
  }
}

async function unregisterLegacyServiceWorker() {
  const { legacyUrl } = resolveServiceWorkerLocation()
  const registration = await navigator.serviceWorker.getRegistration(legacyUrl)
  if (registration) {
    await registration.unregister()
  }
}

async function unregisterActiveServiceWorker() {
  const { scopeUrl } = resolveServiceWorkerLocation()
  const registration = await navigator.serviceWorker.getRegistration(scopeUrl)
  if (registration) {
    await registration.unregister()
  }
}

async function clearServiceWorkerCaches() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith('fragment-prime-'))
      .map((key) => caches.delete(key))
  )
}

function resolveServiceWorkerLocation() {
  const base = import.meta.env.BASE_URL || '/'
  const baseUrl = new URL(base, window.location.href)
  const swUrl = new URL('service-worker.js', baseUrl).toString()
  const legacyUrl = new URL('sw.js', baseUrl).toString()
  const scopeUrl = baseUrl.toString()
  const scope = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`
  return { swUrl, legacyUrl, scopeUrl, scope }
}

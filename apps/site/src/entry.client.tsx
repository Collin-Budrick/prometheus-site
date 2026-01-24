import { render } from '@builder.io/qwik'
import { buildApiUrl, resolveApiHost } from './components/contact-invites/api'
import { getServerBackoffMs, markServerFailure, markServerSuccess } from './shared/server-backoff'
import {
  CLEANUP_VERSION_KEY,
  FORCE_CLEANUP_KEY,
  OPT_OUT_KEY,
  readServiceWorkerSeedFromDocument,
  writeServiceWorkerCleanupVersionCookie,
  writeServiceWorkerOptOutCookie
} from './shared/service-worker-seed'
import Root from './root'

declare global {
  interface Window {
    __FRAGMENT_PRIME_DISABLE_SW__?: boolean
    __FRAGMENT_PRIME_FORCE_SW_CLEANUP__?: boolean
  }
}

const OUTBOX_SYNC_TAG = 'p2p-outbox'
const HEALTH_CHECK_TIMEOUT_MS = 4000
const serviceWorkerSeed = readServiceWorkerSeedFromDocument()

const dispatchSwEvent = (name: string, detail?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

if (import.meta.hot) {
  import.meta.hot.on('vite:connected', () => {
    console.info('[vite] connected (https proxy)')
  })
}

export default function () {
  void render(document, <Root />)

  if ('serviceWorker' in navigator) {
    setupServiceWorkerBridge()
  }

  runNonCriticalSetup(() => {
    setupWebSocketBackoffMonitor()
    setupOfflineErrorFilters()
    setupServerHealthProbe()
  })

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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
        return
      }

      void cleanupPromise.finally(() => {
        void registerServiceWorker()
      })
    })
  }
}

function runNonCriticalSetup(callback: () => void) {
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 2000 })
  } else {
    window.setTimeout(callback, 0)
  }
}

function setupOfflineErrorFilters() {
  if (typeof window === 'undefined') return
  const windowHost = window.location.host
  const apiHost = resolveApiHost(window.location.origin)
  const isServerOffline = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
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
    } catch {
      return ''
    }
  }
  const resolveHostFromResource = (value: unknown) => {
    if (typeof value !== 'string') return ''
    try {
      return new URL(value, window.location.origin).host
    } catch {
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
  const apiHost = resolveApiHost(window.location.origin)
  const resolveKnownHost = (host: string) => {
    if (!host) return ''
    if (host === windowHost) return host
    if (host === apiHost) return host
    return ''
  }
  const resolveHostFromUrl = (value: string | URL) => {
    try {
      return resolveKnownHost(new URL(String(value), window.location.origin).host)
    } catch {
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
      dispatchSwEvent('prom:sw-cache-cleared', { source: 'sw' })
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
  window.addEventListener('prom:sw-refresh-cache', () => {
    void refreshServiceWorkerCache()
  })
  window.addEventListener('prom:sw-clear-cache', () => {
    void clearServiceWorkerCacheAndUnregister()
  })
  window.addEventListener('prom:sw-toggle-cache', (event) => {
    const payload = event instanceof CustomEvent ? (event.detail as { optOut?: boolean } | undefined) : undefined
    const optOut = payload?.optOut === true
    void setServiceWorkerOptOut(optOut)
  })
}

function setupServerHealthProbe() {
  if (typeof window === 'undefined') return
  const serverKey = resolveServerKey()
  const healthUrl = resolveHealthUrl()
  if (!healthUrl) return
  let inFlight = false

  const probe = async () => {
    if (inFlight) return
    if (navigator.onLine === false) return
    if (getServerBackoffMs(serverKey) <= 0) return
    inFlight = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      })
      if (response.ok) {
        markServerSuccess(serverKey)
      } else {
        markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
      }
    } catch {
      markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
    } finally {
      window.clearTimeout(timeout)
      inFlight = false
    }
  }

  window.addEventListener('online', () => {
    void probe()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void probe()
    }
  })
}

function resolveServerKey() {
  if (typeof window === 'undefined') return 'default'
  return resolveApiHost(window.location.origin)
}

function resolveHealthUrl() {
  if (typeof window === 'undefined') return ''
  return buildApiUrl('/health', window.location.origin)
}

async function triggerManualSync() {
  const registration = await getActiveRegistration()
  if (!registration) return
  if ('sync' in registration) {
    try {
      await registration.sync.register(OUTBOX_SYNC_TAG)
      dispatchSwEvent('prom:sw-sync-requested', { method: 'sync' })
      return
    } catch (error) {
      console.warn('Background sync registration failed:', error)
    }
  }
  registration.active?.postMessage({ type: 'p2p:flush-outbox', reason: 'manual' })
  dispatchSwEvent('prom:sw-sync-requested', { method: 'message' })
}

async function refreshServiceWorkerCache() {
  const registration = await getActiveRegistration()
  if (registration?.active) {
    registration.active.postMessage({ type: 'sw:refresh-cache' })
  } else {
    await clearServiceWorkerCaches()
    dispatchSwEvent('prom:sw-cache-refreshed', { source: 'window' })
  }
  try {
    await registration?.update()
  } catch (error) {
    console.warn('Service worker update failed:', error)
  }
}

async function clearServiceWorkerCacheAndUnregister() {
  await unregisterLegacyServiceWorker()
  await unregisterActiveServiceWorker()
  await clearServiceWorkerCaches()
  dispatchSwEvent('prom:sw-cache-cleared', { source: 'window' })
}

async function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  const { swUrl, scope } = resolveServiceWorkerLocation()
  try {
    await navigator.serviceWorker.register(swUrl, { scope })
  } catch (error) {
    console.error('Service worker registration failed:', error)
  }
}

async function getActiveRegistration() {
  const { scopeUrl } = resolveServiceWorkerLocation()
  const registration = await navigator.serviceWorker.getRegistration(scopeUrl)
  if (registration) return registration
  try {
    return await navigator.serviceWorker.ready
  } catch {
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
  } catch {
    return false
  }
}

function hasRunCleanupForVersion() {
  try {
    if (serviceWorkerSeed.cleanupVersion) {
      return serviceWorkerSeed.cleanupVersion === getBuildVersion()
    }
    return window.localStorage.getItem(CLEANUP_VERSION_KEY) === getBuildVersion()
  } catch {
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
    await registerServiceWorker()
    dispatchSwEvent('prom:sw-cache-refreshed', { source: 'window' })
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
      .filter((key) => key.startsWith('fragment-prime-shell') || key.startsWith('fragment-prime-data'))
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

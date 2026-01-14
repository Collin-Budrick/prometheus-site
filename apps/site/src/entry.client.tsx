import { render } from '@builder.io/qwik'
import Root from './root'

declare global {
  interface Window {
    __FRAGMENT_PRIME_DISABLE_SW__?: boolean
    __FRAGMENT_PRIME_FORCE_SW_CLEANUP__?: boolean
  }
}

const CLEANUP_VERSION_KEY = 'fragment:sw-cleanup-version'
const OPT_OUT_KEY = 'fragment:sw-opt-out'
const FORCE_CLEANUP_KEY = 'fragment:sw-force-cleanup'
const OUTBOX_SYNC_TAG = 'p2p-outbox'

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
  render(document, <Root />)

  if ('serviceWorker' in navigator) {
    setupServiceWorkerBridge()
  }

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

      cleanupPromise.finally(() => {
        void registerServiceWorker()
      })
    })
  }
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
  return import.meta.env.VITE_DISABLE_SW === '1' || import.meta.env.VITE_DISABLE_SW === 'true'
}

function isServiceWorkerOptedOut() {
  if (window.__FRAGMENT_PRIME_DISABLE_SW__) return true
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch (error) {
    console.warn('Service worker opt-out lookup failed:', error)
    return false
  }
}

function shouldForceServiceWorkerCleanup() {
  try {
    return (
      window.__FRAGMENT_PRIME_FORCE_SW_CLEANUP__ === true ||
      window.localStorage.getItem(FORCE_CLEANUP_KEY) === '1'
    )
  } catch {
    return false
  }
}

function hasRunCleanupForVersion() {
  try {
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
}

async function setServiceWorkerOptOut(optOut: boolean) {
  try {
    window.localStorage.setItem(OPT_OUT_KEY, optOut ? '1' : '0')
  } catch (error) {
    console.warn('Service worker opt-out update failed:', error)
  }

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

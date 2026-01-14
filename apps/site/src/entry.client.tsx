import { render } from '@builder.io/qwik'
import Root from './root'

declare global {
  interface Window {
    __FRAGMENT_PRIME_DISABLE_SW__?: boolean
    __FRAGMENT_PRIME_FORCE_SW_CLEANUP__?: boolean
  }
}

if (import.meta.hot) {
  import.meta.hot.on('vite:connected', () => {
    console.info('[vite] connected (https proxy)')
  })
}

export default function () {
  render(document, <Root />)

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const getBuildVersion = () =>
        import.meta.env.VITE_APP_VERSION ||
        import.meta.env.VITE_COMMIT_SHA ||
        import.meta.env.VITE_BUILD_SHA ||
        import.meta.env.VERCEL_GIT_COMMIT_SHA ||
        import.meta.env.MODE ||
        'unknown'

      const cleanupVersionKey = 'fragment:sw-cleanup-version'
      const disableServiceWorker =
        import.meta.env.VITE_DISABLE_SW === '1' ||
        import.meta.env.VITE_DISABLE_SW === 'true'
      const shouldSkipServiceWorker =
        disableServiceWorker ||
        window.__FRAGMENT_PRIME_DISABLE_SW__ ||
        (() => {
          try {
            return window.localStorage.getItem('fragment:sw-opt-out') === '1'
          } catch (error) {
            console.warn('Service worker opt-out lookup failed:', error)
            return false
          }
        })()
      const shouldForceCleanup = (() => {
        try {
          return (
            window.__FRAGMENT_PRIME_FORCE_SW_CLEANUP__ === true ||
            window.localStorage.getItem('fragment:sw-force-cleanup') === '1'
          )
        } catch {
          return false
        }
      })()
      const buildVersion = getBuildVersion()
      const hasRunCleanupForVersion = (() => {
        try {
          return window.localStorage.getItem(cleanupVersionKey) === buildVersion
        } catch {
          return false
        }
      })()
      const shouldRunCleanup = shouldForceCleanup || !hasRunCleanupForVersion

      const cleanupPromise = shouldRunCleanup
        ? unregisterLegacyServiceWorker()
            .then(() => unregisterActiveServiceWorker())
            .then(() => clearServiceWorkerCaches())
            .then(() => {
              try {
                window.localStorage.setItem(cleanupVersionKey, buildVersion)
              } catch (error) {
                console.warn('Service worker cleanup flag write failed:', error)
              }
            })
            .catch((error) => console.warn('Service worker cleanup failed:', error))
        : Promise.resolve()

      if (shouldSkipServiceWorker) {
        return
      }

      cleanupPromise.finally(() => {
        const { swUrl, scope } = resolveServiceWorkerLocation()
        navigator.serviceWorker.register(swUrl, { scope }).catch((error) => {
          console.error('Service worker registration failed:', error)
        })
      })
    })
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
      .filter((key) => key.startsWith('fragment-prime-shell'))
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

import { render } from '@builder.io/qwik'
import Root from './root'

declare global {
  interface Window {
    __FRAGMENT_PRIME_DISABLE_SW__?: boolean
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

      const cleanupPromise = unregisterLegacyServiceWorker()
        .then(() => unregisterActiveServiceWorker())
        .then(() => clearServiceWorkerCaches())
        .catch((error) => console.warn('Service worker cleanup failed:', error))

      if (shouldSkipServiceWorker) {
        return
      }

      cleanupPromise.finally(() => {
        navigator.serviceWorker
          .register('/service-worker.js', { scope: '/' })
          .catch((error) => console.error('Service worker registration failed:', error))
      })
    })
  }
}

async function unregisterLegacyServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  if (registration) {
    await registration.unregister()
  }
}

async function unregisterActiveServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration('/service-worker.js')
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

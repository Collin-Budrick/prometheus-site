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
      const shouldSkipServiceWorker =
        window.__FRAGMENT_PRIME_DISABLE_SW__ ||
        (() => {
          try {
            return window.localStorage.getItem('fragment:sw-opt-out') === '1'
          } catch (error) {
            console.warn('Service worker opt-out lookup failed:', error)
            return false
          }
        })()

      const cleanupPromise = unregisterLegacyServiceWorker().catch((error) =>
        console.warn('Legacy service worker cleanup failed:', error)
      )

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

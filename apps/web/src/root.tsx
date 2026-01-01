import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { RouteMotion } from './components/RouteMotion'
import { RouterHead } from './routes/layout'
import { reportClientError } from './shared/error-reporting'
import './global.css'

type RequestIdleCallback = (
  callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  opts?: { timeout?: number }
) => number

const DocumentLang = component$(() => {
  useVisibleTask$(() => {
    const html = document.documentElement
    if (!html.lang) html.lang = 'en'
  })
  return null
})

const ClientSignals = component$(() => {
  useVisibleTask$(() => {
    const { VITE_ENABLE_ANALYTICS, VITE_ANALYTICS_BEACON_URL, VITE_REPORT_CLIENT_ERRORS, VITE_ERROR_BEACON_URL } =
      import.meta.env
    const analyticsEnabled =
      VITE_ENABLE_ANALYTICS === '1' || VITE_ENABLE_ANALYTICS === 'true' || VITE_ENABLE_ANALYTICS === true
    const errorReportingEnabled =
      VITE_REPORT_CLIENT_ERRORS === '1' || VITE_REPORT_CLIENT_ERRORS === 'true' || VITE_REPORT_CLIENT_ERRORS === true

    if (!analyticsEnabled && !errorReportingEnabled) return

    const deferTask = (task: () => void) => {
      const idle =
        (window as typeof window & { requestIdleCallback?: RequestIdleCallback }).requestIdleCallback

      if (idle) {
        idle(
          () => {
            task()
          },
          { timeout: 300 }
        )
        return
      }

      setTimeout(task, 0)
    }

    if (analyticsEnabled && typeof VITE_ANALYTICS_BEACON_URL === 'string' && VITE_ANALYTICS_BEACON_URL.length) {
      deferTask(() => {
        const payload = JSON.stringify({
          path: window.location.pathname,
          referrer: document.referrer,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          timestamp: Date.now()
        })
        const body = new Blob([payload], { type: 'application/json' })
        const sent = navigator.sendBeacon?.(VITE_ANALYTICS_BEACON_URL, body)

        if (!sent) {
          fetch(VITE_ANALYTICS_BEACON_URL, {
            method: 'POST',
            body,
            keepalive: true,
            headers: { 'content-type': 'application/json' }
          }).catch(() => {})
        }
      })
    }

    if (errorReportingEnabled && typeof VITE_ERROR_BEACON_URL === 'string' && VITE_ERROR_BEACON_URL.length) {
      const handleError = (event: ErrorEvent) => {
        deferTask(() =>
          reportClientError(VITE_ERROR_BEACON_URL, event.error ?? event.message, {
            source: 'window.error',
            path: window.location.pathname
          })
        )
      }

      const handleRejection = (event: PromiseRejectionEvent) => {
        deferTask(() =>
          reportClientError(VITE_ERROR_BEACON_URL, event.reason, {
            source: 'unhandledrejection',
            path: window.location.pathname
          })
        )
      }

      window.addEventListener('error', handleError)
      window.addEventListener('unhandledrejection', handleRejection)

      return () => {
        window.removeEventListener('error', handleError)
        window.removeEventListener('unhandledrejection', handleRejection)
      }
    }
  })

  return null
})

export default component$(() => (
  <QwikCityProvider viewTransition>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <RouterHead />
    </head>
    <body class="app-shell">
      <DocumentLang />
      <ClientSignals />
      <RouteMotion />
      <RouterOutlet />
    </body>
  </QwikCityProvider>
))

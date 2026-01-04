import { component$, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet, useLocation } from '@builder.io/qwik-city'
import { scheduleIdleTask } from './components/motion-idle'
import { RouteMotion } from './components/RouteMotion'
import { RouterHead } from './routes/layout'
import { reportClientError } from './shared/error-reporting'
import { FragmentStatusProvider } from './shared/fragment-status'
import { LangProvider } from './shared/lang-bridge'
import { initQuicklinkPrefetch, isPrefetchEnabled } from './shared/prefetch'
import globalStyles from './global.css?inline'

type RequestIdleCallback = (
  callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  opts?: { timeout?: number }
) => number

const ClientSignals = component$(() => {
  useVisibleTask$(
    () => {
      const { VITE_ENABLE_ANALYTICS, VITE_ANALYTICS_BEACON_URL, VITE_REPORT_CLIENT_ERRORS, VITE_ERROR_BEACON_URL } =
        import.meta.env
      const analyticsEnabled =
        VITE_ENABLE_ANALYTICS === '1' || VITE_ENABLE_ANALYTICS === 'true'
      const errorReportingEnabled =
        VITE_REPORT_CLIENT_ERRORS === '1' || VITE_REPORT_CLIENT_ERRORS === 'true'

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
    },
    { strategy: 'document-idle' }
  )

  return null
})

const PrefetchSignals = component$(() => {
  const location = useLocation()

  useVisibleTask$(
    ({ cleanup, track }) => {
      track(() => location.url.pathname + location.url.search)

      if (!isPrefetchEnabled(import.meta.env)) return

      const hasFragmentLinks = () =>
        typeof document !== 'undefined' && document.querySelector('a[data-fragment-link]') !== null

      let stopPrefetch: (() => void) | undefined
      let cancelled = false

      const startPrefetch = () => {
        if (cancelled) return
        if (!hasFragmentLinks()) return
        initQuicklinkPrefetch(import.meta.env, true)
          .then((stop) => {
            if (cancelled) {
              stop?.()
              return
            }
            stopPrefetch = stop
          })
          .catch((error) => console.warn('[prefetch] Quicklink initialization failed', error))
      }

      const stopIdle = scheduleIdleTask(startPrefetch, 800)

      cleanup(() => {
        cancelled = true
        stopIdle()
        stopPrefetch?.()
      })
    },
    { strategy: 'document-idle' }
  )

  return null
})

const ClientExtras = component$(() => (
  <>
    <ClientSignals />
    <PrefetchSignals />
    <RouteMotion />
  </>
))

export default component$(() => {
  useStyles$(globalStyles)
  const clientReady = useSignal(false)

  useVisibleTask$(
    ({ cleanup }) => {
      let resolved = false

      const enable = () => {
        if (resolved) return
        resolved = true
        clientReady.value = true
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          ;(window as typeof window & { __PROM_CLIENT_READY?: boolean }).__PROM_CLIENT_READY = true
          document.dispatchEvent(new Event('client-ready'))
        }
      }

      const stopIdle = scheduleIdleTask(enable, 1400)
      const handleInput = () => enable()

      window.addEventListener('pointerdown', handleInput, { once: true })
      window.addEventListener('keydown', handleInput, { once: true })

      cleanup(() => {
        stopIdle()
        window.removeEventListener('pointerdown', handleInput)
        window.removeEventListener('keydown', handleInput)
      })
    },
    { strategy: 'document-idle' }
  )

  return (
    <QwikCityProvider viewTransition>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <RouterHead />
      </head>
      <body class="app-shell">
        {clientReady.value ? <ClientExtras /> : null}
        <LangProvider>
          <FragmentStatusProvider>
            <RouterOutlet />
          </FragmentStatusProvider>
        </LangProvider>
      </body>
    </QwikCityProvider>
  )
})

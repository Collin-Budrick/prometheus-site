import { component$, useSignal, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet, useLocation } from '@builder.io/qwik-city'
import { RouteMotion, scheduleIdleTask } from '@prometheus/ui'
import globalStyles from '@prometheus/ui/global.css?inline'
import { createClientErrorReporter } from '@platform/logging'
import { RouterHead } from './routes/layout'
import { FragmentStatusProvider } from './shared/fragment-status'
import { LangProvider } from './shared/lang-bridge'
import { initQuicklinkPrefetch } from './shared/prefetch'
import { appConfig } from './app-config'

type RequestIdleCallback = (
  callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  opts?: { timeout?: number }
) => number

const ClientSignals = component$(() => {
  useVisibleTask$(
    () => {
      const { analytics, clientErrors } = appConfig
      const analyticsEnabled = analytics.enabled && Boolean(analytics.beaconUrl)
      const errorReportingEnabled = clientErrors.enabled && Boolean(clientErrors.beaconUrl)
      const reportClientError = createClientErrorReporter(clientErrors)

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

      if (analyticsEnabled) {
        deferTask(() => {
          const payload = JSON.stringify({
            path: window.location.pathname,
            referrer: document.referrer,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            timestamp: Date.now()
          })
          const body = new Blob([payload], { type: 'application/json' })
          const sent = navigator.sendBeacon?.(analytics.beaconUrl, body)

          if (!sent) {
            fetch(analytics.beaconUrl, {
              method: 'POST',
              body,
              keepalive: true,
              headers: { 'content-type': 'application/json' }
            }).catch(() => {})
          }
        })
      }

      if (errorReportingEnabled) {
        const handleError = (event: ErrorEvent) => {
          deferTask(() =>
            reportClientError(event.error ?? event.message, {
              source: 'window.error',
              path: window.location.pathname
            })
          )
        }

        const handleRejection = (event: PromiseRejectionEvent) => {
          deferTask(() =>
            reportClientError(event.reason, {
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

      if (!appConfig.enablePrefetch) return

      const hasFragmentLinks = () =>
        typeof document !== 'undefined' && document.querySelector('a[data-fragment-link]') !== null

      let stopPrefetch: (() => void) | undefined
      let cancelled = false

      const startPrefetch = () => {
        if (cancelled) return
        if (!hasFragmentLinks()) return
        initQuicklinkPrefetch(appConfig, true)
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

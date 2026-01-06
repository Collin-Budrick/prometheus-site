import { Slot, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'
import { initQuicklinkPrefetch } from './prefetch'

type IdleHandles = {
  idle: number | null
  timeout: number | null
}

type ClientErrorReporter = (error: unknown, metadata?: Record<string, unknown>) => void

export type ClientExtrasConfig = {
  apiBase: string
  enablePrefetch: boolean
  analytics?: {
    enabled: boolean
    beaconUrl?: string
  }
  reportClientError?: ClientErrorReporter
}

const scheduleIdleTask = (callback: () => void, timeout = 120) => {
  const handles: IdleHandles = { idle: null, timeout: null }
  let cancelled = false
  let fired = false

  const run = () => {
    if (cancelled || fired) return
    fired = true
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
    if (handles.idle !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(handles.idle)
    }
    handles.idle = null
    handles.timeout = null
    callback()
  }

  if ('requestIdleCallback' in window) {
    handles.idle = window.requestIdleCallback(run)
  }

  handles.timeout = window.setTimeout(() => {
    run()
  }, timeout)

  return () => {
    cancelled = true
    if (handles.idle !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(handles.idle)
    }
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
  }
}

type RequestIdleCallback = (
  callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  opts?: { timeout?: number }
) => number

const ClientSignals = component$(({ config }: { config: ClientExtrasConfig }) => {
  useVisibleTask$(
    () => {
      const analytics = config.analytics
      const analyticsEnabled = Boolean(analytics?.enabled && analytics?.beaconUrl)
      const reportClientError = config.reportClientError
      const errorReportingEnabled = typeof reportClientError === 'function'

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

      if (analyticsEnabled && analytics?.beaconUrl) {
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

const PrefetchSignals = component$(({ config }: { config: ClientExtrasConfig }) => {
  const location = useLocation()

  useVisibleTask$(
    ({ cleanup, track }) => {
      track(() => location.url.pathname + location.url.search)

      if (!config.enablePrefetch) return

      const hasFragmentLinks = () =>
        typeof document !== 'undefined' && document.querySelector('a[data-fragment-link]') !== null

      let stopPrefetch: (() => void) | undefined
      let cancelled = false

      const startPrefetch = () => {
        if (cancelled) return
        if (!hasFragmentLinks()) return
        initQuicklinkPrefetch({ apiBase: config.apiBase }, true)
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

export const ClientExtras = component$(({ config }: { config: ClientExtrasConfig }) => (
  <>
    <ClientSignals config={config} />
    <PrefetchSignals config={config} />
  </>
))

export const useClientReady = () => {
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

  return clientReady
}

export const ClientReadyGate = component$(() => <Slot />)

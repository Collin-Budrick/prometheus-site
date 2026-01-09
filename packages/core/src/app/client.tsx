import { Slot, component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import { useLocation } from '@builder.io/qwik-city'
import { initQuicklinkPrefetch } from './prefetch'

type IdleHandles = {
  timeout: number | null
}

type ClientErrorReporter = (error: unknown, metadata?: Record<string, unknown>) => void

type TaskPriority = 'background' | 'user-visible' | 'user-blocking'

type TaskControllerConstructor = new (options?: { priority?: TaskPriority }) => AbortController

type SchedulerLike = {
  postTask?: (callback: () => void, options?: { priority?: TaskPriority; signal?: AbortSignal }) => Promise<void>
  yield?: (options?: { priority?: TaskPriority }) => Promise<void>
}

export type ClientExtrasConfig = {
  apiBase: string
  enablePrefetch: boolean
  analytics?: {
    enabled: boolean
    beaconUrl?: string
  }
  reportClientError?: ClientErrorReporter
}

type SchedulerGlobals = typeof globalThis & {
  scheduler?: SchedulerLike
  TaskController?: TaskControllerConstructor
}

let schedulerImport: Promise<void> | null = null

const ensureSchedulerPolyfill = () => {
  if (typeof window === 'undefined') return
  if (schedulerImport) return
  schedulerImport = import('scheduler-polyfill').then(() => {}).catch(() => {})
}

const getSchedulerGlobals = () => globalThis as SchedulerGlobals

const scheduleIdleTask = (
  callback: () => void,
  timeout = 120,
  priority: TaskPriority = 'background'
) => {
  ensureSchedulerPolyfill()
  const globals = getSchedulerGlobals()
  const scheduler = globals.scheduler
  const TaskControllerImpl = globals.TaskController ?? AbortController
  const postTask = scheduler?.postTask?.bind(scheduler)
  const yieldTask = scheduler?.yield?.bind(scheduler)
  const handles: IdleHandles = { timeout: null }
  const controller = new TaskControllerImpl()
  let cancelled = false
  let fired = false

  const run = () => {
    if (cancelled || fired) return
    fired = true
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
    handles.timeout = null
    callback()
  }

  if (postTask) {
    postTask(run, { priority, signal: controller.signal }).catch(() => {})
  } else if (yieldTask) {
    yieldTask({ priority })
      .then(run)
      .catch(() => {})
  }

  if (typeof window === 'undefined') {
    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }

  handles.timeout = window.setTimeout(() => {
    run()
  }, timeout)

  return () => {
    cancelled = true
    controller.abort()
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
  }
}

const schedulePriorityTask = (
  task: () => void,
  { priority = 'background', timeout = 300 }: { priority?: TaskPriority; timeout?: number } = {}
) => {
  ensureSchedulerPolyfill()
  const globals = getSchedulerGlobals()
  const scheduler = globals.scheduler
  const postTask = scheduler?.postTask?.bind(scheduler)
  const yieldTask = scheduler?.yield?.bind(scheduler)
  let fired = false
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  const run = () => {
    if (fired) return
    fired = true
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
    task()
  }

  if (typeof window === 'undefined') {
    run()
    return
  }

  timeoutHandle = window.setTimeout(run, timeout)

  if (postTask) {
    postTask(run, { priority }).catch(() => {})
    return
  }

  if (yieldTask) {
    yieldTask({ priority })
      .then(run)
      .catch(() => {})
    return
  }

  setTimeout(run, 0)
}

const ClientSignals = component$(({ config }: { config: ClientExtrasConfig }) => {
  useVisibleTask$(
    () => {
      const analytics = config.analytics
      const beaconUrl = analytics?.beaconUrl
      const analyticsEnabled = Boolean(analytics?.enabled && analytics?.beaconUrl)
      const reportClientError = config.reportClientError
      const errorReportingEnabled = typeof reportClientError === 'function'

      if (!analyticsEnabled && !errorReportingEnabled) return

      const deferTask = (task: () => void) => {
        schedulePriorityTask(task, { priority: 'background', timeout: 300 })
      }

      if (analyticsEnabled && beaconUrl) {
        deferTask(() => {
          const payload = JSON.stringify({
            path: window.location.pathname,
            referrer: document.referrer,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            timestamp: Date.now()
          })
          const body = new Blob([payload], { type: 'application/json' })
          const sent = navigator.sendBeacon?.(beaconUrl, body)

          if (!sent) {
            fetch(beaconUrl, {
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
    (ctx) => {
      ctx.track(() => location.url.pathname + location.url.search)

      if (!config.enablePrefetch) return

      const hasFragmentLinks = () =>
        typeof document !== 'undefined' && document.querySelector('a[data-fragment-link]') !== null

      let stopPrefetch: (() => void) | undefined
      let cancelled = false

      const startPrefetch = () => {
        if (cancelled) return
        if (!hasFragmentLinks()) return
        initQuicklinkPrefetch({ apiBase: config.apiBase })
          .then((stop) => {
            if (cancelled) {
              stop?.()
              return
            }
            stopPrefetch = stop
          })
          .catch(() => {})
      }

      const stopIdle = scheduleIdleTask(startPrefetch, 800, 'background')

      ctx.cleanup(() => {
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
    (ctx) => {
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

      const stopIdle = scheduleIdleTask(enable, 1400, 'user-visible')
      const handleInput = () => enable()

      window.addEventListener('pointerdown', handleInput, { once: true })
      window.addEventListener('keydown', handleInput, { once: true })

      ctx.cleanup(() => {
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

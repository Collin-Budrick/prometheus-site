import { component$, useStyles$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { ClientExtras, useClientReady, type ClientExtrasConfig } from '@core'
import { createClientErrorReporter, initHighlight } from '@platform/logging'
import { RouteMotion } from '@prometheus/ui'
import globalCriticalStyles from '@prometheus/ui/global-critical.css?inline'
import globalStyles from '@prometheus/ui/global.css?inline'
import { RouterHead } from './routes/layout'
import { FragmentStatusProvider } from '@core/fragments'
import { appConfig } from './app-config'

const shouldEnableAmbientMotion = () => {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: {
      effectiveType?: string
      saveData?: boolean
      downlink?: number
    }
  }
  const connection = nav.connection
  if (connection?.saveData) return false
  const effectiveType = connection?.effectiveType ?? ''
  if (effectiveType && ['slow-2g', '2g', '3g'].includes(effectiveType)) return false
  if (typeof connection?.downlink === 'number' && connection.downlink > 0 && connection.downlink < 1.5) return false
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) return false
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return false
  return true
}

const setupLcpGate = (
  ctx: { cleanup: (cleanupFn: () => void) => void },
  onReady: () => void,
  options?: { timeoutMs?: number }
) => {
  const timeoutMs = options?.timeoutMs ?? 3000
  let fired = false
  let timeoutHandle: number | null = null
  let observer: PerformanceObserver | null = null

  const cleanup = () => {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
    observer?.disconnect()
    observer = null
    window.removeEventListener('pointerdown', handleInteraction)
    window.removeEventListener('keydown', handleInteraction)
    window.removeEventListener('touchstart', handleInteraction)
  }

  const run = () => {
    if (fired) return
    fired = true
    cleanup()
    onReady()
  }

  const handleInteraction = () => {
    run()
  }

  const observeLcp = () => {
    if (!('PerformanceObserver' in window)) return
    try {
      observer = new PerformanceObserver((list) => {
        if (list.getEntries().length === 0) return
        run()
      })
      observer.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      observer?.disconnect()
      observer = null
    }
  }

  window.addEventListener('pointerdown', handleInteraction, { once: true, passive: true })
  window.addEventListener('keydown', handleInteraction, { once: true })
  window.addEventListener('touchstart', handleInteraction, { once: true, passive: true })
  timeoutHandle = window.setTimeout(run, timeoutMs)
  observeLcp()

  ctx.cleanup(() => cleanup())
}

export default component$(() => {
  useStyles$(globalCriticalStyles)
  useStyles$(globalStyles)
  const clientReady = useClientReady()
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      setupLcpGate(
        ctx,
        () => {
          initHighlight(appConfig.highlight, { apiBase: appConfig.apiBase })
        },
        { timeoutMs: 3000 }
      )
    },
    { strategy: 'document-idle' }
  )
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      if (!shouldEnableAmbientMotion()) return
      const root = document.documentElement

      setupLcpGate(
        ctx,
        () => {
          window.requestAnimationFrame(() => {
            root.dataset.decorReady = 'true'
          })
        },
        { timeoutMs: 2000 }
      )
    },
    { strategy: 'document-idle' }
  )
  const clientExtrasConfig: ClientExtrasConfig = {
    apiBase: appConfig.apiBase,
    enablePrefetch: appConfig.enablePrefetch,
    analytics: appConfig.analytics,
    reportClientError: createClientErrorReporter(appConfig.highlight)
  }

  return (
    <QwikCityProvider viewTransition>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <RouterHead />
      </head>
      <body class="app-shell">
        {clientReady.value ? (
          <>
            <ClientExtras config={clientExtrasConfig} />
            <RouteMotion />
          </>
        ) : null}
        <FragmentStatusProvider>
          <RouterOutlet />
        </FragmentStatusProvider>
        <div class="viewport-fade" aria-hidden="true" />
      </body>
    </QwikCityProvider>
  )
})

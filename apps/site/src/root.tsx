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
import { hideNativeSplashScreen, initNativeShell } from './native/native-shell'
import { isNativeCapacitorRuntime } from './native/runtime'

const shouldEnableAmbientMotion = () => {
  if (typeof window === 'undefined') return false
  if (isNativeCapacitorRuntime()) return true
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


const waitForClientAppReady = async () => {
  if (typeof window === 'undefined') return
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) => {
      const onReady = () => {
        document.removeEventListener('DOMContentLoaded', onReady)
        resolve()
      }
      document.addEventListener('DOMContentLoaded', onReady, { once: true })
    })
  }
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

const viewportFadeHeadStyle = `
  .viewport-fade {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483647;
    background:
      linear-gradient(
        to bottom,
        rgb(var(--viewport-fade-color) / 0.95),
        rgb(var(--viewport-fade-color) / 0)
      )
        top / 100% var(--viewport-fade-size) no-repeat,
      linear-gradient(
        to top,
        rgb(var(--viewport-fade-color) / 0.9),
        rgb(var(--viewport-fade-color) / 0)
      )
        bottom / 100% var(--viewport-fade-size) no-repeat;
  }

  @supports (height: 1svh) {
    .viewport-fade {
      height: 100svh;
    }
  }
`

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
    } catch (error) {
      console.warn('Failed to observe LCP in root readiness gate:', error)
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
  useVisibleTask$(() => {
    if (typeof window !== 'undefined') {
      (window as { __prometheusNativeRuntime?: boolean }).__prometheusNativeRuntime = isNativeCapacitorRuntime()
    }
    initNativeShell()
  })
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
      const shouldEnable = shouldEnableAmbientMotion()
      const isNative = isNativeCapacitorRuntime()
      const root = document.documentElement
      const supportsViewTransition =
        shouldEnable &&
        !isNative &&
        'startViewTransition' in document &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (shouldEnable) {
        root.dataset.motionEnabled = 'true'
      } else {
        delete root.dataset.motionEnabled
      }
      if (supportsViewTransition) {
        root.dataset.viewTransitions = 'true'
      } else {
        delete root.dataset.viewTransitions
      }
      if (!shouldEnable) return

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

  useVisibleTask$(({ track }) => {
    const isClientReady = track(() => clientReady.value)
    if (!isClientReady) return
    void waitForClientAppReady().then(() => hideNativeSplashScreen())
  })
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
        <style>{viewportFadeHeadStyle}</style>
        <RouterHead />
      </head>
      <body class="app-shell" data-client-ready={clientReady.value ? 'true' : 'false'}>
        <div class="client-runtime-layer">
          {clientReady.value ? (
            <>
              <ClientExtras config={clientExtrasConfig} />
              <RouteMotion />
            </>
          ) : null}
        </div>
        <div class="native-boot-skeleton static-route-skeleton" aria-hidden="true">
          <span class="skeleton-line is-meta" />
          <span class="skeleton-line is-title" />
          <span class="skeleton-line is-description" />
          <span class="skeleton-line is-button" />
        </div>
        <FragmentStatusProvider>
          <RouterOutlet />
        </FragmentStatusProvider>
        <div class="viewport-fade" aria-hidden="true" />
      </body>
    </QwikCityProvider>
  )
})

import { isNativeCapacitorRuntime } from './runtime'

type TelemetryEvent = {
  metric: 'startup-interactive-ms' | 'long-task-ms' | 'transition-jank-ms' | 'deep-link-latency-ms'
  value: number
  tags?: Record<string, string>
}

declare global {
  interface WindowEventMap {
    'prom:deep-link-start': CustomEvent<{ targetPath: string; startedAt: number }>
    'prom:telemetry-native-feel': CustomEvent<TelemetryEvent>
  }
}

const emitTelemetry = (event: TelemetryEvent) => {
  window.dispatchEvent(new CustomEvent('prom:telemetry-native-feel', { detail: event }))
  console.info('[native-feel]', event.metric, event.value, event.tags ?? {})
}

const setupStartupInteractiveTelemetry = () => {
  const origin = performance.timeOrigin || Date.now() - performance.now()
  const startedAt = origin

  const complete = () => {
    const value = Math.max(0, Math.round(performance.now() + origin - startedAt))
    emitTelemetry({ metric: 'startup-interactive-ms', value })
    window.removeEventListener('pointerdown', complete)
    window.removeEventListener('keydown', complete)
    window.removeEventListener('touchstart', complete)
  }

  window.addEventListener('pointerdown', complete, { once: true, passive: true })
  window.addEventListener('keydown', complete, { once: true })
  window.addEventListener('touchstart', complete, { once: true, passive: true })
}

const setupLongTaskTelemetry = () => {
  if (typeof PerformanceObserver === 'undefined') return
  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        emitTelemetry({ metric: 'long-task-ms', value: Math.round(entry.duration) })
      })
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch {
    // no-op
  }
}

const setupTransitionJankTelemetry = () => {
  let active = false
  let frameHandle = 0
  let last = 0

  const stop = () => {
    active = false
    if (frameHandle) cancelAnimationFrame(frameHandle)
    frameHandle = 0
  }

  const tick = (timestamp: number) => {
    if (!active) return
    if (last > 0) {
      const delta = timestamp - last
      const overBudget = delta - 16.7
      if (overBudget >= 50) {
        emitTelemetry({ metric: 'transition-jank-ms', value: Math.round(overBudget) })
      }
    }
    last = timestamp
    frameHandle = requestAnimationFrame(tick)
  }

  const start = () => {
    stop()
    active = true
    last = 0
    frameHandle = requestAnimationFrame(tick)
    window.setTimeout(stop, 1_500)
  }

  window.addEventListener('popstate', start)
  window.addEventListener('prometheus:native-back-intent', start as EventListener)
}

const setupDeepLinkLatencyTelemetry = () => {
  let pending: { path: string; startedAt: number } | null = null

  window.addEventListener('prom:deep-link-start', (event) => {
    pending = { path: event.detail.targetPath, startedAt: event.detail.startedAt }
  })

  window.addEventListener('popstate', () => {
    if (!pending) return
    const reached = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (reached !== pending.path) return
    const duration = Math.max(0, Math.round(performance.now() - pending.startedAt))
    emitTelemetry({ metric: 'deep-link-latency-ms', value: duration, tags: { path: reached } })
    pending = null
  })
}

let initialized = false

export const initNativeFeelTelemetry = () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  if (!isNativeCapacitorRuntime()) return
  setupStartupInteractiveTelemetry()
  setupLongTaskTelemetry()
  setupTransitionJankTelemetry()
  setupDeepLinkLatencyTelemetry()
}

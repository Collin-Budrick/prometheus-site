type HomeDemoPerformanceWindow = Window & {
  __PROM_HOME_DEMO_PERF_DEBUG__?: boolean
}

const HOME_DEMO_PERF_DEBUG_STORAGE_KEY = 'prom:debug-home-demo-perf'

const isDevBuild = () =>
  (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true

const readDetailedMarkDebugOverride = () => {
  if (typeof window === 'undefined') return false
  const pageWindow = window as HomeDemoPerformanceWindow
  if (pageWindow.__PROM_HOME_DEMO_PERF_DEBUG__ === true) {
    return true
  }
  try {
    return window.localStorage.getItem(HOME_DEMO_PERF_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const shouldMarkDetailedHomeDemoPerformance = () =>
  isDevBuild() || readDetailedMarkDebugOverride()

export const markHomeDemoPerformance = (
  name: string,
  { detailed = false }: { detailed?: boolean } = {}
) => {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
    return
  }
  if (detailed && !shouldMarkDetailedHomeDemoPerformance()) {
    return
  }
  performance.mark(name)
}

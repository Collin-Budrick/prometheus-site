export const HOME_FIRST_LCP_TIMEOUT_MS = 2500

type HomeLcpEntryList = Pick<PerformanceObserverEntryList, 'getEntries'>

type HomeLcpObserver = Pick<PerformanceObserver, 'disconnect' | 'observe'>

type HomeLcpObserverConstructor = new (
  callback: (list: HomeLcpEntryList, observer: HomeLcpObserver) => void
) => HomeLcpObserver

type HomeLcpGateDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>

type HomeLcpGateWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'> & {
  PerformanceObserver?: HomeLcpObserverConstructor
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
}

type HomeTimerHandle = ReturnType<HomeLcpGateWindow['setTimeout']>

export type HomeFirstLcpGate = {
  wait: Promise<void>
  cleanup: () => void
}

type CreateHomeFirstLcpGateOptions = {
  win?: HomeLcpGateWindow | null
  doc?: HomeLcpGateDocument | null
  PerformanceObserverImpl?: HomeLcpObserverConstructor | null
  timeoutMs?: number
}

const createResolvedGate = (): HomeFirstLcpGate => ({
  wait: Promise.resolve(),
  cleanup: () => undefined
})

const markHomeLcpRelease = () => {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
    return
  }
  performance.mark('prom:home:lcp-release')
}

export const createHomeFirstLcpGate = ({
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  PerformanceObserverImpl = win?.PerformanceObserver ?? null,
  timeoutMs = HOME_FIRST_LCP_TIMEOUT_MS
}: CreateHomeFirstLcpGateOptions = {}): HomeFirstLcpGate => {
  if (!win || !doc) {
    return createResolvedGate()
  }

  if (win.__PROM_STATIC_HOME_LCP_RELEASED__) {
    return createResolvedGate()
  }

  let resolved = false
  let timeoutId: HomeTimerHandle | null = null
  let observer: HomeLcpObserver | null = null

  let resolveWait!: () => void
  const wait = new Promise<void>((resolve) => {
    resolveWait = resolve
  })

  const cleanup = () => {
    if (observer) {
      observer.disconnect()
      observer = null
    }

    doc.removeEventListener('visibilitychange', handleVisibilityChange)
    win.removeEventListener('pagehide', handlePageHide)
    win.removeEventListener('pageshow', handlePageShow)

    if (timeoutId !== null) {
      win.clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const finish = () => {
    if (resolved) return
    resolved = true
    markHomeLcpRelease()
    cleanup()
    resolveWait()
  }

  const handleVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') {
      finish()
    }
  }

  const handlePageHide = () => {
    finish()
  }

  const handlePageShow = (event?: PageTransitionEvent) => {
    if (event?.persisted) {
      finish()
    }
  }

  doc.addEventListener('visibilitychange', handleVisibilityChange)
  win.addEventListener('pagehide', handlePageHide)
  win.addEventListener('pageshow', handlePageShow)
  timeoutId = win.setTimeout(finish, timeoutMs)

  if (doc.visibilityState === 'hidden') {
    finish()
    return { wait, cleanup }
  }

  if (PerformanceObserverImpl) {
    try {
      observer = new PerformanceObserverImpl((list) => {
        if (list.getEntries().length > 0) {
          finish()
        }
      })
      observer.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      observer = null
    }
  }

  return {
    wait,
    cleanup
  }
}

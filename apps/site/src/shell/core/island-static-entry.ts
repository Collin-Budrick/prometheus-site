import { loadIslandBootstrapRuntime } from './runtime-loaders'
import {
  ISLAND_STATIC_ROUTE_KIND,
  STATIC_ISLAND_DATA_SCRIPT_ID,
  STATIC_PAGE_ROOT_ATTR,
  STATIC_ROUTE_ATTR,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'

type IslandStaticEntryWindow = Window & {
  __PROM_STATIC_ISLAND_ENTRY__?: boolean
}

type IslandBootstrapDomSnapshot = {
  islandRoot: Element
  pageRoot: Element
  settingsToggle: Element
  shellSeedText: string
  routeDataText: string
}

type ObserveIslandDom = (callback: () => void) => () => void

type InstallIslandStaticEntryOptions = {
  doc?: Document | null
  loadRuntime?: typeof loadIslandBootstrapRuntime
  observeDom?: ObserveIslandDom | null
  win?: IslandStaticEntryWindow | null
}

const resolveScriptText = (doc: Pick<Document, 'getElementById'>, id: string) => {
  const script = doc.getElementById(id)
  return script?.textContent?.trim() || null
}

const readIslandBootstrapDomSnapshot = (doc: Pick<Document, 'getElementById' | 'querySelector'>) => {
  const islandRoot = doc.querySelector(`[${STATIC_ROUTE_ATTR}="${ISLAND_STATIC_ROUTE_KIND}"]`)
  const pageRoot = doc.querySelector(`[${STATIC_PAGE_ROOT_ATTR}]`)
  const settingsToggle = doc.querySelector('[data-static-settings-toggle]')
  const shellSeedText = resolveScriptText(doc, STATIC_SHELL_SEED_SCRIPT_ID)
  const routeDataText = resolveScriptText(doc, STATIC_ISLAND_DATA_SCRIPT_ID)

  if (!islandRoot || !pageRoot || !settingsToggle || !shellSeedText || !routeDataText) {
    return null
  }

  return {
    islandRoot,
    pageRoot,
    settingsToggle,
    shellSeedText,
    routeDataText
  } satisfies IslandBootstrapDomSnapshot
}

const islandBootstrapSnapshotChanged = (
  current: IslandBootstrapDomSnapshot | null,
  previous: IslandBootstrapDomSnapshot | null
) => {
  if (!current) {
    return previous !== null
  }

  if (!previous) {
    return true
  }

  return (
    current.islandRoot !== previous.islandRoot ||
    current.pageRoot !== previous.pageRoot ||
    current.settingsToggle !== previous.settingsToggle ||
    current.shellSeedText !== previous.shellSeedText ||
    current.routeDataText !== previous.routeDataText
  )
}

const observeIslandDomMutations: ObserveIslandDom = (callback) => {
  if (
    typeof MutationObserver !== 'function' ||
    typeof document === 'undefined' ||
    !document.documentElement
  ) {
    return () => undefined
  }

  const observer = new MutationObserver(() => {
    callback()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  })
  return () => observer.disconnect()
}

export const installIslandStaticEntry = ({
  doc = typeof document !== 'undefined' ? document : null,
  loadRuntime = loadIslandBootstrapRuntime,
  observeDom = observeIslandDomMutations,
  win = typeof window !== 'undefined' ? (window as IslandStaticEntryWindow) : null
}: InstallIslandStaticEntryOptions = {}) => {
  if (!win || !doc || win.__PROM_STATIC_ISLAND_ENTRY__) {
    return () => undefined
  }

  win.__PROM_STATIC_ISLAND_ENTRY__ = true

  let disposed = false
  let bootstrapPromise: Promise<void> | null = null
  let bootstrapQueued = false
  let rebootstrapRequested = false
  let stopObservingDom: (() => void) | null = null
  let lastSnapshot: IslandBootstrapDomSnapshot | null = null
  let readyHandler: (() => void) | null = null

  const runBootstrap = () => {
    if (disposed) return
    const snapshot = readIslandBootstrapDomSnapshot(doc)
    if (!snapshot) {
      if (lastSnapshot) {
        lastSnapshot = null
        void loadRuntime()
          .then(({ disposeStaticIslandShell }) => disposeStaticIslandShell?.())
          .catch((error) => {
            console.error('Static island cleanup failed:', error)
          })
      }
      return
    }

    if (!islandBootstrapSnapshotChanged(snapshot, lastSnapshot)) {
      return
    }

    if (bootstrapPromise) {
      rebootstrapRequested = true
      return
    }

    bootstrapPromise = loadRuntime()
      .then(({ bootstrapStaticIslandShell }) => bootstrapStaticIslandShell())
      .then(() => {
        lastSnapshot = snapshot
      })
      .catch((error) => {
        console.error('Static island bootstrap failed:', error)
      })
      .finally(() => {
        bootstrapPromise = null
        if (disposed) return
        if (rebootstrapRequested) {
          rebootstrapRequested = false
          queueBootstrap()
        }
      })
  }

  const queueBootstrap = () => {
    if (disposed || bootstrapQueued) return
    bootstrapQueued = true
    queueMicrotask(() => {
      bootstrapQueued = false
      runBootstrap()
    })
  }

  const start = () => {
    if (disposed) return
    queueBootstrap()
    stopObservingDom ??= observeDom?.(() => {
      queueBootstrap()
    }) ?? null
  }

  if (doc.readyState === 'loading') {
    readyHandler = () => {
      readyHandler = null
      start()
    }
    doc.addEventListener('DOMContentLoaded', readyHandler, { once: true })
  } else {
    start()
  }

  return () => {
    disposed = true
    if (readyHandler) {
      doc.removeEventListener('DOMContentLoaded', readyHandler)
      readyHandler = null
    }
    stopObservingDom?.()
    stopObservingDom = null
    lastSnapshot = null
    void loadRuntime()
      .then(({ disposeStaticIslandShell }) => disposeStaticIslandShell?.())
      .catch((error) => {
        console.error('Static island cleanup failed:', error)
      })
    win.__PROM_STATIC_ISLAND_ENTRY__ = false
  }
}

if (typeof window !== 'undefined') {
  const cleanup = installIslandStaticEntry()
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanup()
    })
  }
}

export {}

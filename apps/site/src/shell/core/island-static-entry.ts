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

type IslandRouteData = {
  island?: string
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

const DEFERRED_ISLAND_BOOTSTRAP_DELAY_MS = 3600
const ISLAND_BOOTSTRAP_REPLAY_SELECTOR = [
  '[data-static-settings-toggle]',
  '[data-static-settings-action]',
  '[data-static-route-action]',
  '[data-static-profile-name-input]',
  '[data-static-profile-bio]',
  '[data-static-profile-avatar-remove]',
  '[data-static-login-disable]',
  '[data-static-login-tab]',
  '[data-static-login-provider]'
].join(', ')

const resolveScriptText = (doc: Pick<Document, 'getElementById'>, id: string) => {
  const script = doc.getElementById(id)
  return script?.textContent?.trim() || null
}

const resolveSnapshotRouteKind = (snapshot: IslandBootstrapDomSnapshot | null) => {
  if (!snapshot?.routeDataText) return null
  try {
    const routeData = JSON.parse(snapshot.routeDataText) as IslandRouteData
    return typeof routeData.island === 'string' ? routeData.island : null
  } catch {
    return null
  }
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

const isContainedTarget = (container: Element, target: EventTarget | null) =>
  Boolean(target && typeof target === 'object' && container.contains(target as Node))

const isTextInputLike = (target: HTMLElement) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

const replayDeferredInteraction = (target: HTMLElement | null) => {
  if (!target || !target.isConnected) {
    return
  }
  if (isTextInputLike(target)) {
    target.focus()
    if (target instanceof HTMLInputElement) {
      try {
        const caret = target.value.length
        target.setSelectionRange(caret, caret)
      } catch {
        // Ignore input selection failures.
      }
    }
    return
  }
  if (typeof target.click === 'function') {
    target.click()
  }
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
  let stopInteractionBridge: (() => void) | null = null
  let lastSnapshot: IslandBootstrapDomSnapshot | null = null
  let readyHandler: (() => void) | null = null
  let bootstrapRequested = false
  let bootstrapStarted = false
  let deferredBootstrapTimer: ReturnType<typeof setTimeout> | null = null

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

    bootstrapStarted = true
    bootstrapPromise = loadRuntime()
      .then(({ bootstrapStaticIslandShell }) => bootstrapStaticIslandShell())
      .then(() => {
        lastSnapshot = snapshot
        stopInteractionBridge?.()
        stopInteractionBridge = null
        if (deferredBootstrapTimer) {
          clearTimeout(deferredBootstrapTimer)
          deferredBootstrapTimer = null
        }
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
    bootstrapRequested = true
    bootstrapQueued = true
    queueMicrotask(() => {
      bootstrapQueued = false
      runBootstrap()
    })
  }

  const installInteractionBridge = () => {
    if (stopInteractionBridge || bootstrapStarted) {
      return
    }

    const requestBootstrap = () => {
      queueBootstrap()
    }

    const handlePointerDown = (event: Event) => {
      const target = event.target
      const snapshot = readIslandBootstrapDomSnapshot(doc)
      if (
        snapshot &&
        (isContainedTarget(snapshot.pageRoot, target) || isContainedTarget(snapshot.settingsToggle, target))
      ) {
        requestBootstrap()
      }
    }

    const handleClick = (event: Event) => {
      if (bootstrapStarted) {
        return
      }
      const target =
        event.target && typeof event.target === 'object' && 'closest' in event.target
          ? (event.target as Element).closest<HTMLElement>(ISLAND_BOOTSTRAP_REPLAY_SELECTOR)
          : null
      const snapshot = readIslandBootstrapDomSnapshot(doc)
      if (!target || !snapshot) {
        return
      }
      if (!(snapshot.pageRoot.contains(target) || snapshot.settingsToggle.contains(target))) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      requestBootstrap()
      queueMicrotask(() => {
        void bootstrapPromise?.then(() => {
          window.setTimeout(() => {
            replayDeferredInteraction(target)
          }, 0)
        })
      })
    }

    const handleSubmit = (event: Event) => {
      if (bootstrapStarted) {
        return
      }
      const form = event.target instanceof HTMLFormElement ? event.target : null
      const snapshot = readIslandBootstrapDomSnapshot(doc)
      if (!form || !snapshot || !snapshot.pageRoot.contains(form)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      const submitter = event instanceof SubmitEvent ? (event.submitter as HTMLElement | null) : null
      requestBootstrap()
      queueMicrotask(() => {
        void bootstrapPromise?.then(() => {
          if (submitter && submitter.isConnected && typeof submitter.click === 'function') {
            submitter.click()
            return
          }
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit()
            return
          }
          form.submit()
        })
      })
    }

    doc.addEventListener('pointerdown', handlePointerDown, true)
    doc.addEventListener('click', handleClick, true)
    doc.addEventListener('submit', handleSubmit, true)

    deferredBootstrapTimer = setTimeout(() => {
      deferredBootstrapTimer = null
      requestBootstrap()
    }, DEFERRED_ISLAND_BOOTSTRAP_DELAY_MS)

    stopInteractionBridge = () => {
      doc.removeEventListener('pointerdown', handlePointerDown, true)
      doc.removeEventListener('click', handleClick, true)
      doc.removeEventListener('submit', handleSubmit, true)
      if (deferredBootstrapTimer) {
        clearTimeout(deferredBootstrapTimer)
        deferredBootstrapTimer = null
      }
    }
  }

  const start = () => {
    if (disposed) return
    installInteractionBridge()
    stopObservingDom ??= observeDom?.(() => {
      if (!bootstrapRequested) {
        return
      }
      queueBootstrap()
    }) ?? null
    const routeKind = resolveSnapshotRouteKind(readIslandBootstrapDomSnapshot(doc))
    if (routeKind === 'login' || routeKind === 'settings') {
      queueBootstrap()
    }
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
    stopInteractionBridge?.()
    stopInteractionBridge = null
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

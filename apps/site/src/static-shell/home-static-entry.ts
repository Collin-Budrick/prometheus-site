import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'
import { loadHomeDemoEntryRuntime } from './home-demo-entry-loader'
import { loadFragmentWidgetRuntime } from '../fragment/ui/fragment-widget-runtime-loader'
import { createHomeFirstLcpGate } from './home-lcp-gate'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import {
  STATIC_HOME_PAINT_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR
} from './constants'
import { scheduleStaticRoutePaintReady } from './static-route-paint'
import { scheduleStaticShellTask } from './scheduler'
import {
  markStaticShellPerformance,
  markStaticShellUserTiming,
  measureStaticShellUserTiming
} from './static-shell-performance'
import {
  disposeHomeSharedRuntime,
  ensureHomeSharedRuntime,
  ensureHomeSharedRuntimeAssetPreloads
} from './home-shared-runtime'

export const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

type HomeStaticEntryWindow = Window & {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
}

type InstallHomeStaticEntryOptions = {
  win?: HomeStaticEntryWindow | null
  doc?: Document | null
  loadBootstrapRuntime?: typeof loadHomeBootstrapRuntime
  createLcpGate?: typeof createHomeFirstLcpGate
  schedulePaintReady?: typeof scheduleStaticRoutePaintReady
  scheduleTask?: typeof scheduleStaticShellTask
  startSharedRuntime?: typeof ensureHomeSharedRuntime
  preloadSharedRuntimeAssets?: typeof ensureHomeSharedRuntimeAssetPreloads
  disposeSharedRuntime?: typeof disposeHomeSharedRuntime
  loadDemoEntryRuntime?: typeof loadHomeDemoEntryRuntime
}

const HOME_FRAGMENT_CARD_SELECTOR = '[data-static-fragment-card]'

const escapeFragmentId = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

const resolveInteractionCard = (target: EventTarget | null) => {
  if (!target || typeof target !== 'object') {
    return null
  }

  const element =
    'closest' in target && typeof target.closest === 'function'
      ? (target as Element)
      : 'parentElement' in target &&
          (target as { parentElement?: Element | null }).parentElement &&
          typeof (target as { parentElement?: Element | null }).parentElement?.closest === 'function'
        ? (target as { parentElement: Element }).parentElement
        : null
  return element?.closest<HTMLElement>(HOME_FRAGMENT_CARD_SELECTOR) ?? null
}

const hasStaticHomeFragmentVersionMismatch = (doc: Document) => {
  if (
    typeof (doc as Document & { getElementById?: unknown }).getElementById !== 'function' ||
    typeof doc.querySelector !== 'function'
  ) {
    return false
  }

  const data = readStaticHomeBootstrapData({ doc })
  if (!data) {
    return false
  }

  return Object.entries(data.fragmentVersions).some(([fragmentId, version]) => {
    const card = doc.querySelector<HTMLElement>(
      `[data-fragment-id="${escapeFragmentId(fragmentId)}"]`
    )
    if (!card) {
      return false
    }
    const renderedVersion = card.getAttribute(STATIC_FRAGMENT_VERSION_ATTR)
    return typeof renderedVersion === 'string' && renderedVersion !== `${version}`
  })
}

export const installHomeStaticEntry = ({
  win = typeof window !== 'undefined' ? (window as HomeStaticEntryWindow) : null,
  doc = typeof document !== 'undefined' ? document : null,
  loadBootstrapRuntime = loadHomeBootstrapRuntime,
  createLcpGate = createHomeFirstLcpGate,
  schedulePaintReady = scheduleStaticRoutePaintReady,
  scheduleTask = scheduleStaticShellTask,
  startSharedRuntime = ensureHomeSharedRuntime,
  preloadSharedRuntimeAssets = ensureHomeSharedRuntimeAssetPreloads,
  disposeSharedRuntime = disposeHomeSharedRuntime,
  loadDemoEntryRuntime = loadHomeDemoEntryRuntime
}: InstallHomeStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  void scheduleTask

  const liveWin = win
  const liveDoc = doc

  markStaticShellUserTiming('prom:home:static-entry-install')
  liveWin.__PROM_STATIC_HOME_ENTRY__ = true

  let startedBootstrap = false
  let bootstrapTriggersInstalled = false
  let domReadyHandler: (() => void) | null = null
  let loadHandler: (() => void) | null = null
  let bootstrapRequested = false
  let lcpGateReleased = false
  let bootstrapRuntimePromise: ReturnType<typeof loadBootstrapRuntime> | null = null
  let demoEntryRuntimePromise: ReturnType<typeof loadDemoEntryRuntime> | null = null
  let widgetRuntimePromise: ReturnType<typeof loadFragmentWidgetRuntime> | null = null
  let widgetRuntime:
    | import('../fragment/ui/fragment-widget-runtime').FragmentWidgetRuntime
    | null = null
  let lcpGateCleanup: (() => void) | null = null
  let paintReadyCleanup: (() => void) | null = null
  let sharedRuntimeStarted = false

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }
  const readStaticHomeRoot = () => liveDoc.querySelector<HTMLElement>('[data-static-home-root]')
  const hasHomeDemoRoots = () => Boolean(liveDoc.querySelector?.('[data-home-demo-root]'))
  const readWidgetRoot = () =>
    liveDoc.querySelector<HTMLElement>(
      `[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}"]`
    ) ?? readStaticHomeRoot()
  const hasBootstrapSetupPrereqs = () =>
    Boolean(readStaticHomeRoot()) && Boolean(readStaticHomeBootstrapData({ doc: liveDoc }))

  const clearStartupHandlers = () => {
    if (domReadyHandler) {
      liveDoc.removeEventListener?.('DOMContentLoaded', domReadyHandler)
      domReadyHandler = null
    }

    if (loadHandler) {
      liveWin.removeEventListener('load', loadHandler)
      loadHandler = null
    }
  }

  const cleanupTriggers = () => {
    liveWin.removeEventListener('pointerdown', handlePointerDown, eventOptions)
    liveWin.removeEventListener('touchstart', handlePointerDown, eventOptions)
    liveWin.removeEventListener('keydown', handleKeyDown, eventOptions)
    liveDoc.removeEventListener?.('focusin', handleFocusIn, eventOptions)
    clearStartupHandlers()

    lcpGateCleanup?.()
    lcpGateCleanup = null
    paintReadyCleanup?.()
    paintReadyCleanup = null
    widgetRuntime?.destroy()
    widgetRuntime = null
    disposeSharedRuntime(liveWin)
  }

  const prewarmBootstrapRuntime = () => {
    if (!bootstrapRuntimePromise) {
      markStaticShellUserTiming('prom:home:bootstrap-runtime-requested')
      bootstrapRuntimePromise = loadBootstrapRuntime()
        .then((runtime) => {
          markStaticShellUserTiming('prom:home:bootstrap-runtime-ready')
          measureStaticShellUserTiming(
            'prom:home:bootstrap-runtime',
            'prom:home:bootstrap-runtime-requested',
            'prom:home:bootstrap-runtime-ready'
          )
          return runtime
        })
        .catch((error) => {
          bootstrapRuntimePromise = null
          throw error
        })
    }
    return bootstrapRuntimePromise
  }

  const prewarmWidgetRuntime = () => {
    widgetRuntimePromise ??= loadFragmentWidgetRuntime()
    return widgetRuntimePromise
  }

  const startHomeDemoEntry = () => {
    if (demoEntryRuntimePromise || !hasHomeDemoRoots()) {
      return demoEntryRuntimePromise
    }

    demoEntryRuntimePromise = loadDemoEntryRuntime().catch((error) => {
      demoEntryRuntimePromise = null
      console.error('Static home demo entry failed:', error)
      throw error
    })
    return demoEntryRuntimePromise
  }

  const startHomeWorkerRuntime = () => {
    if (sharedRuntimeStarted) {
      return
    }

    const data = readStaticHomeBootstrapData({ doc: liveDoc })
    if (!data || !data.runtimePlanEntries.length) {
      return
    }

    preloadSharedRuntimeAssets({ doc: liveDoc })
    sharedRuntimeStarted = Boolean(
      startSharedRuntime(
        {
          path: data.currentPath,
          lang: data.lang,
          planEntries: data.runtimePlanEntries,
          fetchGroups: data.runtimeFetchGroups,
          initialFragments: data.runtimeInitialFragments,
          knownVersions: data.fragmentVersions,
          bootstrapHref: data.fragmentBootstrapHref,
          startupMode: 'eager-visible-first',
          enableStreaming: false
        },
        liveWin
      )
    )
  }

  const startWidgetRuntime = (target: EventTarget | null = null) => {
    return prewarmWidgetRuntime()
      .then((module) => {
        widgetRuntime ??= module.createFragmentWidgetRuntime({
          root: readWidgetRoot(),
          observeMutations: true
        })
        if (target) {
          widgetRuntime.handleInteraction(target)
        }
      })
      .catch((error) => {
        widgetRuntimePromise = null
        console.error('Static home widget runtime failed:', error)
      })
  }

  const startBootstrap = () => {
    if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) return
    startedBootstrap = true
    liveWin.__PROM_STATIC_HOME_BOOTSTRAP__ = true

    void prewarmBootstrapRuntime()
      .then(({ bootstrapStaticHome }) => bootstrapStaticHome())
      .catch((error) => {
        bootstrapRuntimePromise = null
        console.error('Static home bootstrap failed:', error)
      })
  }

  function requestBootstrap() {
    bootstrapRequested = true
    void prewarmBootstrapRuntime().catch((error) => {
      bootstrapRuntimePromise = null
      console.error('Static home bootstrap prewarm failed:', error)
    })
    if (lcpGateReleased) {
      startBootstrap()
    }
  }

  function handlePointerDown(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    void startWidgetRuntime(event.target)
    requestBootstrap()
  }

  function handleFocusIn(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    void startWidgetRuntime(event.target)
    requestBootstrap()
  }

  function handleKeyDown() {
    if (!resolveInteractionCard(liveDoc.activeElement)) {
      return
    }
    void startWidgetRuntime(liveDoc.activeElement)
    requestBootstrap()
  }

  const releaseLcpGate = () => {
    if (lcpGateReleased) return
    lcpGateReleased = true
    liveWin.__PROM_STATIC_HOME_LCP_RELEASED__ = true
    lcpGateCleanup?.()
    lcpGateCleanup = null
    markStaticShellPerformance('prom:home:lcp-release-start')
    paintReadyCleanup ??= schedulePaintReady({
      root: readStaticHomeRoot(),
      readyAttr: STATIC_HOME_PAINT_ATTR,
      requestFrame:
        typeof liveWin.requestAnimationFrame === 'function'
          ? liveWin.requestAnimationFrame.bind(liveWin)
          : undefined,
      cancelFrame:
        typeof liveWin.cancelAnimationFrame === 'function'
          ? liveWin.cancelAnimationFrame.bind(liveWin)
          : undefined,
      setTimer: liveWin.setTimeout.bind(liveWin),
      clearTimer: liveWin.clearTimeout.bind(liveWin),
      onReady: () => {
        if (hasStaticHomeFragmentVersionMismatch(liveDoc)) {
          requestBootstrap()
        }
        void startHomeDemoEntry()
        startBootstrap()
      }
    })
  }

  const setupBootstrapTriggers = () => {
    if (
      bootstrapTriggersInstalled ||
      startedBootstrap ||
      liveWin.__PROM_STATIC_HOME_BOOTSTRAP__ ||
      !hasBootstrapSetupPrereqs()
    ) {
      return false
    }
    bootstrapTriggersInstalled = true
    clearStartupHandlers()
    startHomeWorkerRuntime()
    requestBootstrap()
    liveWin.addEventListener('pointerdown', handlePointerDown, eventOptions)
    liveWin.addEventListener('touchstart', handlePointerDown, eventOptions)
    liveWin.addEventListener('keydown', handleKeyDown, eventOptions)
    liveDoc.addEventListener?.('focusin', handleFocusIn, eventOptions)

    const lcpGate = createLcpGate({ win: liveWin, doc: liveDoc })
    lcpGateCleanup = lcpGate.cleanup
    void lcpGate.wait.then(() => {
      if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) return
      releaseLcpGate()
    })
    return true
  }

  if (!setupBootstrapTriggers()) {
    if (liveDoc.readyState === 'loading') {
      domReadyHandler = () => {
        domReadyHandler = null
        setupBootstrapTriggers()
      }
      liveDoc.addEventListener?.('DOMContentLoaded', domReadyHandler, { once: true })
    }

    loadHandler = () => {
      loadHandler = null
      setupBootstrapTriggers()
    }
    liveWin.addEventListener('load', loadHandler, { once: true })
  }

  return cleanupTriggers
}

if (typeof window !== 'undefined') {
  installHomeStaticEntry()
}

export {}

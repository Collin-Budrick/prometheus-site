import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'
import { loadHomeCollabEntryRuntime } from './home-collab-entry-loader'
import { loadHomeDemoEntryRuntime } from './home-demo-entry-loader'
import { primeHomeFragmentBootstrapBytes } from './home-fragment-bootstrap'
import { createHomeFirstLcpGate } from './home-lcp-gate'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import {
  STATIC_HOME_PAINT_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR
} from './constants'
import { HOME_COLLAB_ROOT_SELECTOR } from './home-collab-shared'
import { appConfig } from '../public-app-config'
import { releaseQueuedReadyStaggerWithin } from '@prometheus/ui/ready-stagger'
import { scheduleStaticRoutePaintReady } from './static-route-paint'
import { scheduleStaticShellTask } from './scheduler'
import { createLayoutSnapshot } from './layout-snapshot'
import {
  markStaticShellPerformance,
  markStaticShellUserTiming,
  measureStaticShellPerformance,
  measureStaticShellUserTiming
} from './static-shell-performance'

export const HOME_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const
export const HOME_BOOTSTRAP_VISIBILITY_ROOT_MARGIN = appConfig.fragmentVisibilityMargin

type HomeStaticEntryWindow = Window & {
  __PROM_STATIC_HOME_ENTRY__?: boolean
  __PROM_STATIC_HOME_BOOTSTRAP__?: boolean
  __PROM_STATIC_HOME_COLLAB_ENTRY__?: boolean
  __PROM_STATIC_HOME_LCP_RELEASED__?: boolean
  __PROM_STATIC_HOME_DEMO_ENTRY__?: boolean
}

type InstallHomeStaticEntryOptions = {
  win?: HomeStaticEntryWindow | null
  doc?: Document | null
  loadBootstrapRuntime?: typeof loadHomeBootstrapRuntime
  loadCollabRuntime?: typeof loadHomeCollabEntryRuntime
  loadDemoRuntime?: typeof loadHomeDemoEntryRuntime
  primeBootstrap?: typeof primeHomeFragmentBootstrapBytes
  createLcpGate?: typeof createHomeFirstLcpGate
  releaseReadyStagger?: typeof releaseQueuedReadyStaggerWithin
  schedulePaintReady?: typeof scheduleStaticRoutePaintReady
  scheduleTask?: typeof scheduleStaticShellTask
}

const HOME_FRAGMENT_CARD_SELECTOR = '[data-static-fragment-card]'
const HOME_READY_STAGGER_SELECTOR = '[data-static-home-root] .fragment-card[data-ready-stagger-state="queued"]'
const HOME_COLLAB_VISIBILITY_ROOT_MARGIN = '0px'

const isAutoBootstrapHomeCardStage = (value: string | null) => value === 'anchor' || value === 'deferred'
const isRefreshableHomeFragmentKind = (value: string | null) =>
  value === 'planner' || value === 'ledger' || value === 'island' || value === 'react'

const isAutoBootstrapHomeCard = (card: Element) => {
  const stage =
    typeof (card as Element).getAttribute === 'function'
      ? card.getAttribute(STATIC_HOME_STAGE_ATTR)
      : null
  if (!isAutoBootstrapHomeCardStage(stage)) {
    return false
  }

  const patchState = card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)
  if (patchState === 'pending') {
    return true
  }

  return (
    patchState === 'ready' &&
    isRefreshableHomeFragmentKind(card.getAttribute(STATIC_HOME_FRAGMENT_KIND_ATTR))
  )
}

const collectAutoBootstrapHomeCards = (root: Pick<Document, 'querySelectorAll'>) =>
  typeof root.querySelectorAll === 'function'
    ? Array.from(root.querySelectorAll<HTMLElement>(HOME_FRAGMENT_CARD_SELECTOR)).filter((card) =>
        isAutoBootstrapHomeCard(card)
      )
    : []

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
  loadCollabRuntime = loadHomeCollabEntryRuntime,
  loadDemoRuntime = loadHomeDemoEntryRuntime,
  primeBootstrap = primeHomeFragmentBootstrapBytes,
  createLcpGate = createHomeFirstLcpGate,
  releaseReadyStagger = releaseQueuedReadyStaggerWithin,
  schedulePaintReady = scheduleStaticRoutePaintReady,
  scheduleTask = scheduleStaticShellTask
}: InstallHomeStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  const liveWin = win
  const liveDoc = doc

  markStaticShellUserTiming('prom:home:static-entry-install')
  liveWin.__PROM_STATIC_HOME_ENTRY__ = true

  let startedBootstrap = false
  let startedCollabEntry = false
  let startedDemoEntry = false
  let loadHandler: (() => void) | null = null
  let bootstrapRequested = false
  let lcpGateReleased = false
  let bootstrapPrimePromise: Promise<Uint8Array> | null = null
  let bootstrapRuntimePromise: ReturnType<typeof loadBootstrapRuntime> | null = null
  let collabEntryCleanup: (() => void) | null = null
  let collabVisibilityObserver: IntersectionObserver | null = null
  let lcpGateCleanup: (() => void) | null = null
  let demoEntryCleanup: (() => void) | null = null
  let visibilityObserver: IntersectionObserver | null = null
  let paintReadyCleanup: (() => void) | null = null
  const scheduledReleaseTasks = new Set<() => void>()
  const observedCards = new Set<Element>()
  const observedCollabRoots = new Set<Element>()

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }
  const readStaticHomeRoot = () => liveDoc.querySelector<HTMLElement>('[data-static-home-root]')

  const cleanupTriggers = () => {
    liveWin.removeEventListener('pointerdown', handlePointerDown, eventOptions)
    liveWin.removeEventListener('touchstart', handlePointerDown, eventOptions)
    liveWin.removeEventListener('keydown', handleKeyDown, eventOptions)
    liveDoc.removeEventListener?.('focusin', handleFocusIn, eventOptions)

    if (loadHandler) {
      liveWin.removeEventListener('load', loadHandler)
      loadHandler = null
    }

    lcpGateCleanup?.()
    lcpGateCleanup = null
    collabEntryCleanup?.()
    collabEntryCleanup = null
    demoEntryCleanup?.()
    demoEntryCleanup = null
    collabVisibilityObserver?.disconnect()
    collabVisibilityObserver = null
    visibilityObserver?.disconnect()
    visibilityObserver = null
    paintReadyCleanup?.()
    paintReadyCleanup = null
    scheduledReleaseTasks.forEach((cleanup) => cleanup())
    scheduledReleaseTasks.clear()
    observedCollabRoots.clear()
    observedCards.clear()
  }

  const scheduleReleaseTask = (
    callback: () => void,
    priority: 'background' | 'user-visible' | 'user-blocking' = 'user-visible',
    timeoutMs = 0
  ) => {
    let cleanup = () => undefined
    cleanup = scheduleTask(
      () => {
        scheduledReleaseTasks.delete(cleanup)
        callback()
      },
      {
        priority,
        timeoutMs,
        preferIdle: false
      }
    )
    scheduledReleaseTasks.add(cleanup)
    return cleanup
  }

  const startDemoEntry = () => {
    if (startedDemoEntry || liveWin.__PROM_STATIC_HOME_DEMO_ENTRY__) return
    startedDemoEntry = true
    void loadDemoRuntime()
      .then(({ installHomeDemoEntry }) => {
        demoEntryCleanup = installHomeDemoEntry()
      })
      .catch((error) => {
        console.error('Static home demo entry failed:', error)
      })
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

  const primeBootstrapRequest = () => {
    const data = readStaticHomeBootstrapData({ doc: liveDoc })
    const bootstrapHref = data?.fragmentBootstrapHref
    if (!bootstrapHref || bootstrapPrimePromise) {
      return bootstrapPrimePromise
    }

    markStaticShellPerformance('prom:home:bootstrap-prime-start')
    bootstrapPrimePromise = primeBootstrap({ href: bootstrapHref }).catch((error) => {
      markStaticShellPerformance('prom:home:bootstrap-prime-ready')
      measureStaticShellPerformance(
        'prom:home:bootstrap-prime',
        'prom:home:bootstrap-prime-start',
        'prom:home:bootstrap-prime-ready'
      )
      bootstrapPrimePromise = null
      console.error('Static home bootstrap prime failed:', error)
      throw error
    })

    void bootstrapPrimePromise.then(() => {
      markStaticShellPerformance('prom:home:bootstrap-prime-ready')
      measureStaticShellPerformance(
        'prom:home:bootstrap-prime',
        'prom:home:bootstrap-prime-start',
        'prom:home:bootstrap-prime-ready'
      )
    })

    return bootstrapPrimePromise
  }

  const startCollabEntry = (initialTarget: EventTarget | null = null) => {
    if (startedCollabEntry || liveWin.__PROM_STATIC_HOME_COLLAB_ENTRY__) return
    startedCollabEntry = true
    collabVisibilityObserver?.disconnect()
    collabVisibilityObserver = null
    observedCollabRoots.clear()

    void loadCollabRuntime()
      .then(({ installHomeCollabEntry }) => {
        collabEntryCleanup = installHomeCollabEntry({ initialTarget })
      })
      .catch((error) => {
        startedCollabEntry = false
        console.error('Static home collab entry failed:', error)
      })
  }

  const startBootstrap = () => {
    if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) return
    startedBootstrap = true
    liveWin.__PROM_STATIC_HOME_BOOTSTRAP__ = true
    visibilityObserver?.disconnect()
    visibilityObserver = null
    observedCards.clear()

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
    void primeBootstrapRequest()?.catch(() => undefined)
    if (lcpGateReleased) {
      startBootstrap()
    }
  }

  function handlePointerDown(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    requestBootstrap()
  }

  function handleFocusIn(event: Event) {
    if (!resolveInteractionCard(event.target)) {
      return
    }
    requestBootstrap()
  }

  function handleKeyDown() {
    if (!resolveInteractionCard(liveDoc.activeElement)) {
      return
    }
    requestBootstrap()
  }

  const observeAutoBootstrapCards = () => {
    if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) {
      return
    }

    if (typeof IntersectionObserver !== 'function') {
      if (collectAutoBootstrapHomeCards(liveDoc).length > 0) {
        requestBootstrap()
      }
      return
    }

    if (!visibilityObserver) {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) {
            return
          }

          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return
            }
            requestBootstrap()
          })
        },
        {
          root: null,
          rootMargin: HOME_BOOTSTRAP_VISIBILITY_ROOT_MARGIN,
          threshold: 0
        }
      )
    }

    collectAutoBootstrapHomeCards(liveDoc).forEach((card) => {
      if (observedCards.has(card)) {
        return
      }
      observedCards.add(card)
      visibilityObserver?.observe(card)
    })
  }

  const observeCollabRoots = () => {
    if (startedCollabEntry || liveWin.__PROM_STATIC_HOME_COLLAB_ENTRY__) {
      return
    }

    const roots =
      typeof liveDoc.querySelectorAll === 'function'
        ? Array.from(liveDoc.querySelectorAll<HTMLElement>(HOME_COLLAB_ROOT_SELECTOR))
        : []
    if (!roots.length) {
      return
    }

    if (typeof IntersectionObserver !== 'function') {
      const layoutSnapshot = createLayoutSnapshot({ win: liveWin, doc: liveDoc })
      const visibleRoot = roots.find((root) => layoutSnapshot.isVisible(root))
      if (visibleRoot) {
        startCollabEntry()
      }
      return
    }

    if (!collabVisibilityObserver) {
      collabVisibilityObserver = new IntersectionObserver(
        (entries) => {
          if (startedCollabEntry || liveWin.__PROM_STATIC_HOME_COLLAB_ENTRY__) {
            return
          }

          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return
            }
            startCollabEntry()
          })
        },
        {
          root: null,
          rootMargin: HOME_COLLAB_VISIBILITY_ROOT_MARGIN,
          threshold: 0
        }
      )
    }

    roots.forEach((root) => {
      if (observedCollabRoots.has(root)) {
        return
      }
      observedCollabRoots.add(root)
      collabVisibilityObserver?.observe(root)
    })
  }

  const releaseLcpGate = () => {
    if (lcpGateReleased) return
    lcpGateReleased = true
    liveWin.__PROM_STATIC_HOME_LCP_RELEASED__ = true
    lcpGateCleanup?.()
    lcpGateCleanup = null
    markStaticShellPerformance('prom:home:lcp-release-start')
    void primeBootstrapRequest()?.catch(() => undefined)
    scheduleReleaseTask(() => {
      startDemoEntry()
    })
    scheduleReleaseTask(() => {
      void prewarmBootstrapRuntime().catch((error) => {
        bootstrapRuntimePromise = null
        console.error('Static home bootstrap prewarm failed:', error)
      })
    })
    scheduleReleaseTask(() => {
      observeCollabRoots()
    }, 'background', 16)
    scheduleReleaseTask(() => {
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
          releaseReadyStagger({
            root: liveDoc,
            queuedSelector: HOME_READY_STAGGER_SELECTOR,
            group: 'static-home-ready'
          })
          if (hasStaticHomeFragmentVersionMismatch(liveDoc)) {
            requestBootstrap()
            return
          }
          if (bootstrapRequested) {
            startBootstrap()
            return
          }
          observeAutoBootstrapCards()
        }
      })
    }, 'user-visible', 16)
  }

  const setupBootstrapTriggers = () => {
    if (startedBootstrap || liveWin.__PROM_STATIC_HOME_BOOTSTRAP__) return
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
  }

  if (liveDoc.readyState === 'complete') {
    setupBootstrapTriggers()
  } else {
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

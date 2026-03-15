import { loadHomeBootstrapRuntime } from './home-bootstrap-runtime-loader'
import { loadHomeCollabEntryRuntime } from './home-collab-entry-loader'
import { loadHomeDemoEntryRuntime } from './home-demo-entry-loader'
import { primeHomeFragmentBootstrapBytes } from './home-fragment-bootstrap'
import { createHomeFirstLcpGate } from './home-lcp-gate'
import { readStaticHomeBootstrapData } from './home-bootstrap-data'
import {
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR
} from './constants'
import { HOME_COLLAB_ROOT_SELECTOR } from './home-collab-shared'
import { appConfig } from '../public-app-config'

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
}

const HOME_FRAGMENT_CARD_SELECTOR = `[${STATIC_FRAGMENT_CARD_ATTR}]`
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

const isElementInViewport = (element: Element) => {
  if (typeof (element as HTMLElement).getBoundingClientRect !== 'function') {
    return true
  }

  const rect = (element as HTMLElement).getBoundingClientRect()
  const viewportWidth =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : document.documentElement?.clientWidth ?? 0
  const viewportHeight =
    typeof window !== 'undefined' && typeof window.innerHeight === 'number'
      ? window.innerHeight
      : document.documentElement?.clientHeight ?? 0

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return true
  }

  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
}

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
  createLcpGate = createHomeFirstLcpGate
}: InstallHomeStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  const liveWin = win
  const liveDoc = doc

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
  const observedCards = new Set<Element>()
  const observedCollabRoots = new Set<Element>()

  const eventOptions: AddEventListenerOptions = { capture: true, passive: true }

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
    observedCollabRoots.clear()
    observedCards.clear()
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
    bootstrapRuntimePromise ??= loadBootstrapRuntime()
    return bootstrapRuntimePromise
  }

  const primeBootstrapRequest = () => {
    const data = readStaticHomeBootstrapData({ doc: liveDoc })
    const bootstrapHref = data?.fragmentBootstrapHref
    if (!bootstrapHref || bootstrapPrimePromise) {
      return bootstrapPrimePromise
    }

    bootstrapPrimePromise = primeBootstrap({ href: bootstrapHref }).catch((error) => {
      bootstrapPrimePromise = null
      console.error('Static home bootstrap prime failed:', error)
      throw error
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
      const visibleRoot = roots.find((root) => isElementInViewport(root))
      if (visibleRoot) {
        startCollabEntry(visibleRoot)
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
            startCollabEntry(entry.target)
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
    startDemoEntry()
    observeCollabRoots()
    void prewarmBootstrapRuntime().catch((error) => {
      bootstrapRuntimePromise = null
      console.error('Static home bootstrap prewarm failed:', error)
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

import { loadFragmentBootstrapRuntime } from './fragment-bootstrap-runtime-loader'
import { loadFragmentWidgetRuntime } from '../../fragment/ui/fragment-widget-runtime-loader'
import { appConfig } from '../../public-app-config'
import { installTrustedTypesFunctionBridge } from '../../security/client'
import { releaseQueuedReadyStaggerWithin } from '@prometheus/ui/ready-stagger'
import { scheduleStaticRoutePaintReady } from '../core/static-route-paint'
import {
  STATIC_FRAGMENT_PAINT_ATTR,
  STATIC_SHELL_MAIN_REGION,
  STATIC_SHELL_REGION_ATTR
} from '../core/constants'

export const FRAGMENT_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focusin'] as const
export const FRAGMENT_BOOTSTRAP_VISIBILITY_ROOT_MARGIN = appConfig.fragmentVisibilityMargin
export const FRAGMENT_BOOTSTRAP_VISIBILITY_THRESHOLD = appConfig.fragmentVisibilityThreshold

type FragmentStaticEntryWindow = Window & {
  __PROM_STATIC_FRAGMENT_BOOTSTRAP__?: boolean
  __PROM_STATIC_FRAGMENT_ENTRY__?: boolean
}

type FragmentStaticEntryDocument = Document

type InstallFragmentStaticEntryOptions = {
  doc?: FragmentStaticEntryDocument | null
  loadRuntime?: typeof loadFragmentBootstrapRuntime
  win?: FragmentStaticEntryWindow | null
  releaseReadyStagger?: typeof releaseQueuedReadyStaggerWithin
  schedulePaintReady?: typeof scheduleStaticRoutePaintReady
}

const STATIC_FRAGMENT_INTERACTIVE_SELECTOR = [
  '[data-static-fragment-root] button',
  '[data-static-fragment-root] input',
  '[data-static-fragment-root] select',
  '[data-static-fragment-root] textarea'
].join(', ')
const STATIC_FRAGMENT_READY_STAGGER_SELECTOR =
  '[data-static-fragment-root] .fragment-card[data-ready-stagger-state="queued"]'

const STATIC_SHELL_INTERACTIVE_SELECTOR = [
  '[data-static-settings-toggle]',
  '[data-static-language-menu-toggle]',
  '[data-static-language-option]',
  '[data-static-theme-toggle]'
].join(', ')

const isTextInputLike = (element: HTMLElement) => {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true
  }

  if (!(element instanceof HTMLInputElement)) {
    return false
  }

  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(
    element.type
  )
}

const replayDeferredInteraction = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement) || !target.isConnected) return

  if (isTextInputLike(target)) {
    target.focus()
    if (target instanceof HTMLInputElement) {
      try {
        const caret = target.value.length
        target.setSelectionRange(caret, caret)
      } catch {
        // Ignore selection failures for non-text inputs.
      }
    }
    return
  }

  if (typeof target.click === 'function') {
    target.click()
  }
}

export const installFragmentStaticEntry = ({
  doc = typeof document !== 'undefined' ? document : null,
  loadRuntime = loadFragmentBootstrapRuntime,
  win = typeof window !== 'undefined' ? (window as FragmentStaticEntryWindow) : null,
  releaseReadyStagger = releaseQueuedReadyStaggerWithin,
  schedulePaintReady = scheduleStaticRoutePaintReady
}: InstallFragmentStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  installTrustedTypesFunctionBridge()
  win.__PROM_STATIC_FRAGMENT_ENTRY__ = true

  let armed = false
  let fragmentBootstrapRequested = false
  let fragmentBootstrapped = false
  let fragmentBootstrapPromise: Promise<void> | null = null
  let fragmentRuntimePromise: ReturnType<typeof loadRuntime> | null = null
  let widgetRuntimePromise: ReturnType<typeof loadFragmentWidgetRuntime> | null = null
  let widgetRuntime:
    | import('../../fragment/ui/fragment-widget-runtime').FragmentWidgetRuntime
    | null = null
  let loadHandler: (() => void) | null = null
  let visibilityObserver: IntersectionObserver | null = null
  let paintReadyCleanup: (() => void) | null = null

  const passiveEventOptions: AddEventListenerOptions = { capture: true, passive: true }
  const clickEventOptions: AddEventListenerOptions = { capture: true, passive: false }
  const readBootstrapRoot = () => doc.querySelector<HTMLElement>('[data-static-fragment-root]')
  const readWidgetRoot = () =>
    doc.querySelector<HTMLElement>(
      `[${STATIC_SHELL_REGION_ATTR}="${STATIC_SHELL_MAIN_REGION}"]`
    ) ?? readBootstrapRoot()

  const prewarmFragmentRuntime = () => {
    fragmentRuntimePromise ??= loadRuntime()
    return fragmentRuntimePromise
  }

  const prewarmWidgetRuntime = () => {
    widgetRuntimePromise ??= loadFragmentWidgetRuntime()
    return widgetRuntimePromise
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
        console.error('Static fragment widget runtime failed:', error)
      })
  }

  const resolveIntentTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null
    if (target.closest(STATIC_SHELL_INTERACTIVE_SELECTOR)) {
      return 'shell'
    }
    if (target.closest(STATIC_FRAGMENT_INTERACTIVE_SELECTOR)) {
      return 'fragment'
    }
    if (target.closest('[data-static-fragment-root]')) {
      return 'root'
    }
    return null
  }

  const removeIntentTriggers = () => {
    FRAGMENT_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.removeEventListener(eventName, handleBootstrapIntent, passiveEventOptions)
    })
  }

  const cleanupBootstrapObservation = () => {
    if (loadHandler) {
      win.removeEventListener('load', loadHandler)
      loadHandler = null
    }
    visibilityObserver?.disconnect()
    visibilityObserver = null
    paintReadyCleanup?.()
    paintReadyCleanup = null
  }

  const cleanupTriggers = () => {
    removeIntentTriggers()
    doc.removeEventListener('click', handleBootstrapSensitiveClick, clickEventOptions)
    cleanupBootstrapObservation()
    widgetRuntime?.destroy()
    widgetRuntime = null
  }

  const startFragmentBootstrap = () => {
    if (fragmentBootstrapped || fragmentBootstrapPromise || win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__) {
      return fragmentBootstrapPromise ?? Promise.resolve()
    }

    cleanupTriggers()
    win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__ = true
    fragmentBootstrapPromise = prewarmFragmentRuntime()
      .then(({ bootstrapStaticFragmentShell }) => bootstrapStaticFragmentShell())
      .then(() => {
        fragmentBootstrapped = true
      })
      .catch((error) => {
        win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__ = false
        fragmentBootstrapPromise = null
        throw error
      })

    return fragmentBootstrapPromise
  }

  function requestFragmentBootstrap() {
    fragmentBootstrapRequested = true
    if (!armed) return
    void startFragmentBootstrap().catch((error) => {
      console.error('Static fragment bootstrap failed:', error)
    })
  }

  function handleBootstrapIntent(event?: Event) {
    void startWidgetRuntime(event?.target ?? null)
    const target = resolveIntentTarget(event?.target ?? doc?.activeElement ?? null)
    if (!target) return
    requestFragmentBootstrap()
  }

  function handleBootstrapSensitiveClick(event: Event) {
    const target = event.target
    if (!(target instanceof Element)) return

    if (target.closest(STATIC_SHELL_INTERACTIVE_SELECTOR)) {
      if (fragmentBootstrapped) return
      event.preventDefault()
      event.stopImmediatePropagation()
      requestFragmentBootstrap()
      void startFragmentBootstrap()
        .then(() => {
          replayDeferredInteraction(target)
        })
        .catch((error) => {
          console.error('Static fragment bootstrap failed:', error)
        })
      return
    }

    if (!target.closest(STATIC_FRAGMENT_INTERACTIVE_SELECTOR)) return

    if (fragmentBootstrapped) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void startWidgetRuntime(target)
    requestFragmentBootstrap()
    void startFragmentBootstrap()
      .then(() => {
        replayDeferredInteraction(target)
      })
      .catch((error) => {
        console.error('Static fragment bootstrap failed:', error)
      })
  }

  const observeBootstrapRoot = () => {
    if (
      fragmentBootstrapped ||
      fragmentBootstrapPromise ||
      win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__
    ) {
      return
    }

    const root = readBootstrapRoot()
    if (!root) return

    if (typeof IntersectionObserver !== 'function') {
      requestFragmentBootstrap()
      return
    }

    if (!visibilityObserver) {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          if (
            fragmentBootstrapped ||
            fragmentBootstrapPromise ||
            win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__
          ) {
            return
          }

          if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
            return
          }

          requestFragmentBootstrap()
        },
        {
          root: null,
          rootMargin: FRAGMENT_BOOTSTRAP_VISIBILITY_ROOT_MARGIN,
          threshold: FRAGMENT_BOOTSTRAP_VISIBILITY_THRESHOLD
        }
      )
    }

    visibilityObserver.observe(root)
  }

  const setupBootstrapTriggers = () => {
    if (armed || fragmentBootstrapped || fragmentBootstrapPromise || win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__) return
    armed = true
    FRAGMENT_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.addEventListener(eventName, handleBootstrapIntent, passiveEventOptions)
    })
    doc.addEventListener('click', handleBootstrapSensitiveClick, clickEventOptions)
    void prewarmFragmentRuntime().catch((error) => {
      fragmentRuntimePromise = null
      console.error('Static fragment runtime prewarm failed:', error)
    })
    void prewarmWidgetRuntime().catch((error) => {
      widgetRuntimePromise = null
      console.error('Static fragment widget runtime prewarm failed:', error)
    })
    paintReadyCleanup ??= schedulePaintReady({
      root: readBootstrapRoot(),
      readyAttr: STATIC_FRAGMENT_PAINT_ATTR,
      requestFrame:
        typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame.bind(win) : undefined,
      cancelFrame:
        typeof win.cancelAnimationFrame === 'function' ? win.cancelAnimationFrame.bind(win) : undefined,
      setTimer: (handler, timeout) => win.setTimeout(handler, timeout),
      clearTimer: (handle) => win.clearTimeout(handle as number),
      onReady: () => {
        void startWidgetRuntime()
        releaseReadyStagger({
          root: doc,
          queuedSelector: STATIC_FRAGMENT_READY_STAGGER_SELECTOR,
          group: 'static-fragment-ready'
        })
      }
    })
    if (fragmentBootstrapRequested) {
      requestFragmentBootstrap()
      return
    }
    observeBootstrapRoot()
  }

  if (doc.readyState === 'complete') {
    setupBootstrapTriggers()
  } else {
    loadHandler = () => {
      loadHandler = null
      setupBootstrapTriggers()
    }
    win.addEventListener('load', loadHandler, { once: true })
  }

  return cleanupTriggers
}

if (typeof window !== 'undefined') {
  installFragmentStaticEntry()
}

export {}

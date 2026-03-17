import {
  attachHomeCollabRoot,
  type AttachHomeCollabRootOptions,
} from '../../static-shell/home-collab-entry'
import {
  activateHomeDemo,
  type HomeDemoKind,
} from '../../static-shell/home-demo-activate'
import { loadStoreStaticRuntime } from '../../static-shell/store-static-runtime-loader'

const FRAGMENT_WIDGET_SELECTOR = '[data-fragment-widget]'
const FRAGMENT_WIDGET_PROPS_SELECTOR = 'script[data-fragment-widget-props]'
const FRAGMENT_WIDGET_WARM_MARGIN = '300px 0px'

type WidgetPriority = 'critical' | 'visible' | 'normal' | 'deferred'
type WidgetCleanup = (() => void) | void | Promise<void>

type FragmentWidgetPayload = {
  props?: Record<string, unknown>
  storeSeed?: unknown
  contactInvitesSeed?: unknown
}

type FragmentWidgetAttachOptions = {
  root: HTMLElement
  target: EventTarget | null
}

type WidgetModule = {
  attach: (
    element: HTMLElement,
    payload: FragmentWidgetPayload,
    options: FragmentWidgetAttachOptions
  ) => WidgetCleanup | Promise<WidgetCleanup>
}

type WidgetDefinition = {
  load: () => Promise<WidgetModule>
}

type FragmentWidgetRuntimeOptions = {
  root?: ParentNode | null
  observeMutations?: boolean
}

export type FragmentWidgetRuntime = {
  observeWithin: (root: ParentNode) => void
  handleInteraction: (target: EventTarget | null) => boolean
  pruneDetached: () => void
  destroy: () => void
}

let storeStaticBootstrapPromise: Promise<void> | null = null
let didWarnContactWidgetFallback = false

const isElementLike = (value: unknown): value is Element =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as { nodeType?: unknown }).nodeType === 1 &&
      typeof (value as { matches?: unknown }).matches === 'function'
  )

const isHTMLElementLike = (value: unknown): value is HTMLElement =>
  isElementLike(value) &&
  typeof (value as { dataset?: unknown }).dataset === 'object'

const readWidgetPriority = (element: HTMLElement): WidgetPriority => {
  const priority = element.dataset.fragmentWidgetPriority
  if (
    priority === 'critical' ||
    priority === 'visible' ||
    priority === 'normal' ||
    priority === 'deferred'
  ) {
    return priority
  }
  return 'normal'
}

const readWidgetProps = (element: HTMLElement): FragmentWidgetPayload => {
  const script = element.querySelector<HTMLScriptElement>(
    FRAGMENT_WIDGET_PROPS_SELECTOR
  )
  if (!script?.textContent) {
    return {}
  }
  try {
    const parsed = JSON.parse(script.textContent) as FragmentWidgetPayload
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch (error) {
    console.error('Failed to parse fragment widget props:', error)
    return {}
  }
}

const normalizeWidgetCleanup = async (cleanup: WidgetCleanup) => {
  if (typeof cleanup === 'function') {
    cleanup()
    return
  }
  await cleanup
}

const resolveHomeDemoKind = (value: string): HomeDemoKind | null => {
  switch (value) {
    case 'planner-demo':
      return 'planner'
    case 'wasm-renderer-demo':
      return 'wasm-renderer'
    case 'react-binary-demo':
      return 'react-binary'
    case 'preact-island':
      return 'preact-island'
    default:
      return null
  }
}

const attachHomeDemoWidget = async (
  element: HTMLElement,
  payload: FragmentWidgetPayload,
  { root }: FragmentWidgetAttachOptions
) => {
  const kind = resolveHomeDemoKind(element.dataset.fragmentWidget ?? '')
  if (!kind) {
    return
  }
  const result = await activateHomeDemo({
    root,
    kind,
    props: payload.props ?? {},
  })
  return result.cleanup
}

const attachHomeCollabWidget = async (
  _element: HTMLElement,
  _payload: FragmentWidgetPayload,
  options: FragmentWidgetAttachOptions
) =>
  attachHomeCollabRoot({
    root: options.root,
    initialTarget: options.target,
  } satisfies AttachHomeCollabRootOptions)

const bootstrapStoreStaticRuntime = async () => {
  storeStaticBootstrapPromise ??= loadStoreStaticRuntime()
    .then(({ bootstrapStaticStoreShell }) => bootstrapStaticStoreShell())
    .catch((error) => {
      storeStaticBootstrapPromise = null
      throw error
    })
  return storeStaticBootstrapPromise
}

const attachStoreWidget = async () => {
  await bootstrapStoreStaticRuntime()
}

const attachContactWidgetFallback = async () => {
  if (!didWarnContactWidgetFallback) {
    didWarnContactWidgetFallback = true
    console.warn(
      'Fragment contact widget runtime has no plain static adapter yet; leaving SSR shell in place.'
    )
  }
}

const widgetDefinitions: Record<string, WidgetDefinition> = {
  'planner-demo': {
    load: async () => ({ attach: attachHomeDemoWidget }),
  },
  'wasm-renderer-demo': {
    load: async () => ({ attach: attachHomeDemoWidget }),
  },
  'react-binary-demo': {
    load: async () => ({ attach: attachHomeDemoWidget }),
  },
  'preact-island': {
    load: async () => ({ attach: attachHomeDemoWidget }),
  },
  'home-collab': {
    load: async () => ({ attach: attachHomeCollabWidget }),
  },
  'store-stream': {
    load: async () => ({ attach: attachStoreWidget }),
  },
  'store-create': {
    load: async () => ({ attach: attachStoreWidget }),
  },
  'store-cart': {
    load: async () => ({ attach: attachStoreWidget }),
  },
  'contact-invites': {
    load: async () => ({ attach: attachContactWidgetFallback }),
  },
}

const scheduleAfterPaint = (callback: () => void) => {
  if (typeof requestAnimationFrame === 'function') {
    let handle = 0
    handle = requestAnimationFrame(() => {
      handle = 0
      callback()
    })
    return () => {
      if (handle) {
        cancelAnimationFrame(handle)
      }
    }
  }
  const timeout = globalThis.setTimeout(callback, 16)
  return () => globalThis.clearTimeout(timeout)
}

const scheduleIdle = (callback: () => void, timeout = 220) => {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestIdleCallback === 'function'
  ) {
    const handle = window.requestIdleCallback(callback, { timeout })
    return () => window.cancelIdleCallback?.(handle)
  }
  const timer = globalThis.setTimeout(callback, Math.min(timeout, 120))
  return () => globalThis.clearTimeout(timer)
}

export const createFragmentWidgetRuntime = ({
  root = null,
  observeMutations = false,
}: FragmentWidgetRuntimeOptions = {}): FragmentWidgetRuntime => {
  const attached = new Map<HTMLElement, () => void>()
  const attaching = new Map<HTMLElement, Promise<void>>()
  const warmedKinds = new Set<string>()
  const observed = new Set<HTMLElement>()
  const eagerQueue = new Set<HTMLElement>()
  let destroyed = false
  let eagerCleanup: (() => void) | null = null
  let observer: IntersectionObserver | null = null
  let mutationObserver: MutationObserver | null = null

  const ensureObserver = () => {
    if (observer || typeof IntersectionObserver !== 'function') {
      return observer
    }
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement
          if (!observed.has(element)) {
            return
          }
          if (entry.intersectionRatio > 0) {
            void attachWidget(element, null)
            return
          }
          if (entry.isIntersecting) {
            void warmWidget(element)
          }
        })
      },
      {
        root: null,
        rootMargin: FRAGMENT_WIDGET_WARM_MARGIN,
        threshold: 0,
      }
    )
    return observer
  }

  const pruneDetached = () => {
    Array.from(attached.entries()).forEach(([element, cleanup]) => {
      if (element.isConnected) {
        return
      }
      attached.delete(element)
      void normalizeWidgetCleanup(cleanup)
    })
    Array.from(attaching.keys()).forEach((element) => {
      if (!element.isConnected) {
        attaching.delete(element)
      }
    })
    Array.from(observed).forEach((element) => {
      if (element.isConnected) {
        return
      }
      observer?.unobserve(element)
      observed.delete(element)
    })
  }

  const attachWidget = async (
    element: HTMLElement,
    target: EventTarget | null
  ) => {
    if (
      destroyed ||
      attached.has(element) ||
      attaching.has(element) ||
      element.dataset.fragmentWidgetHydrated === 'true'
    ) {
      return
    }
    const kind = element.dataset.fragmentWidget
    if (!kind) {
      return
    }
    const definition = widgetDefinitions[kind]
    if (!definition) {
      return
    }
    observer?.unobserve(element)
    observed.delete(element)
    const promise = (async () => {
      try {
        const module = await definition.load()
        if (destroyed || !element.isConnected) {
          return
        }
        const cleanup = await module.attach(element, readWidgetProps(element), {
          root: element,
          target,
        })
        element.dataset.fragmentWidgetHydrated = 'true'
        attached.set(element, () => {
          void normalizeWidgetCleanup(cleanup)
        })
      } catch (error) {
        console.error('Fragment widget attach failed:', error)
      } finally {
        attaching.delete(element)
      }
    })()
    attaching.set(element, promise)
    await promise
  }

  const warmWidget = async (element: HTMLElement) => {
    const kind = element.dataset.fragmentWidget
    if (!kind || warmedKinds.has(kind)) {
      return
    }
    const definition = widgetDefinitions[kind]
    if (!definition) {
      return
    }
    warmedKinds.add(kind)
    try {
      await definition.load()
    } catch (error) {
      warmedKinds.delete(kind)
      console.error('Fragment widget warmup failed:', error)
    }
  }

  const flushEager = () => {
    eagerCleanup = null
    if (destroyed) {
      eagerQueue.clear()
      return
    }
    const widgets = Array.from(eagerQueue)
    eagerQueue.clear()
    widgets.forEach((element) => {
      void attachWidget(element, null)
    })
  }

  const scheduleEager = (element: HTMLElement) => {
    eagerQueue.add(element)
    if (eagerCleanup) {
      return
    }
    eagerCleanup = scheduleAfterPaint(flushEager)
  }

  const registerWidget = (element: HTMLElement) => {
    if (
      destroyed ||
      attached.has(element) ||
      attaching.has(element) ||
      element.dataset.fragmentWidgetHydrated === 'true'
    ) {
      return
    }
    const priority = readWidgetPriority(element)
    if (priority === 'critical' || priority === 'visible') {
      scheduleEager(element)
      return
    }
    if (!ensureObserver()) {
      scheduleIdle(() => {
        if (destroyed || !element.isConnected) {
          return
        }
        void attachWidget(element, null)
      })
      return
    }
    if (!observed.has(element)) {
      observed.add(element)
      observer?.observe(element)
    }
  }

  const observeWithin = (nextRoot: ParentNode) => {
    if (destroyed) {
      return
    }
    pruneDetached()
    const widgets: HTMLElement[] = []
    if (isHTMLElementLike(nextRoot) && nextRoot.matches(FRAGMENT_WIDGET_SELECTOR)) {
      widgets.push(nextRoot)
    }
    nextRoot
      .querySelectorAll?.<HTMLElement>(FRAGMENT_WIDGET_SELECTOR)
      .forEach((element) => {
        widgets.push(element)
      })
    widgets.forEach(registerWidget)
  }

  const handleInteraction = (target: EventTarget | null) => {
    if (destroyed || !isElementLike(target)) {
      return false
    }
    const widget = target.closest<HTMLElement>(FRAGMENT_WIDGET_SELECTOR)
    if (!widget) {
      return false
    }
    void attachWidget(widget, target)
    return true
  }

  if (root && observeMutations && typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (isHTMLElementLike(node)) {
            observeWithin(node)
          }
        })
      })
      pruneDetached()
    })
    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
    })
  }

  if (root) {
    observeWithin(root)
  }

  return {
    observeWithin,
    handleInteraction,
    pruneDetached,
    destroy: () => {
      destroyed = true
      eagerCleanup?.()
      eagerCleanup = null
      mutationObserver?.disconnect()
      mutationObserver = null
      observer?.disconnect()
      observer = null
      observed.clear()
      eagerQueue.clear()
      Array.from(attached.entries()).forEach(([element, cleanup]) => {
        attached.delete(element)
        void normalizeWidgetCleanup(cleanup)
      })
      attaching.clear()
    },
  }
}

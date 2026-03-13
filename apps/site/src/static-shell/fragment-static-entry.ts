import { loadFragmentBootstrapRuntime } from './fragment-bootstrap-runtime-loader'
import { normalizeStaticShellRoutePath } from './constants'
import { loadStoreStaticRuntime } from './store-static-runtime-loader'

export const FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS = 5000
export const FAST_FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS = 1200
export const FRAGMENT_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focusin'] as const
export const STORE_STATIC_FAST_BOOTSTRAP_ROUTE_PATH = '/store'

type FragmentStaticEntryWindow = Window & {
  __PROM_STATIC_FRAGMENT_BOOTSTRAP__?: boolean
  __PROM_STATIC_FRAGMENT_ENTRY__?: boolean
}

type FragmentStaticEntryDocument = Document

type InstallFragmentStaticEntryOptions = {
  doc?: FragmentStaticEntryDocument | null
  loadRuntime?: typeof loadFragmentBootstrapRuntime
  loadStoreRuntime?: typeof loadStoreStaticRuntime
  win?: FragmentStaticEntryWindow | null
}

const FAST_FRAGMENT_BOOTSTRAP_ROUTE_PATHS = new Set(['/store', '/lab'])

const STATIC_FRAGMENT_INTERACTIVE_SELECTOR = [
  '[data-static-fragment-root] button',
  '[data-static-fragment-root] input',
  '[data-static-fragment-root] select',
  '[data-static-fragment-root] textarea'
].join(', ')

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

const readStaticFragmentPath = (
  doc: Pick<Document, 'querySelector'> | null,
  win: Pick<Window, 'location'> | null
) => {
  const root = doc?.querySelector<HTMLElement>('[data-static-fragment-root]')
  return normalizeStaticShellRoutePath(root?.dataset.staticPath ?? win?.location.pathname ?? '')
}

export const resolveFragmentBootstrapIdleTimeout = (path: string | null | undefined) =>
  path && FAST_FRAGMENT_BOOTSTRAP_ROUTE_PATHS.has(normalizeStaticShellRoutePath(path))
    ? FAST_FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS
    : FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS

const isStoreStaticFastBootstrapPath = (path: string | null | undefined) =>
  normalizeStaticShellRoutePath(path ?? '') === STORE_STATIC_FAST_BOOTSTRAP_ROUTE_PATH

export const installFragmentStaticEntry = ({
  doc = typeof document !== 'undefined' ? document : null,
  loadRuntime = loadFragmentBootstrapRuntime,
  loadStoreRuntime = loadStoreStaticRuntime,
  win = typeof window !== 'undefined' ? (window as FragmentStaticEntryWindow) : null
}: InstallFragmentStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  win.__PROM_STATIC_FRAGMENT_ENTRY__ = true

  let armed = false
  let fragmentBootstrapRequested = false
  let fragmentBootstrapped = false
  let fragmentBootstrapPromise: Promise<void> | null = null
  let storeBootstrapRequested = false
  let storeBootstrapped = false
  let storeBootstrapPromise: Promise<void> | null = null
  let loadHandler: (() => void) | null = null
  let fragmentTimeoutId: ReturnType<typeof setTimeout> | null = null
  let storeTimeoutId: ReturnType<typeof setTimeout> | null = null
  const staticPath = readStaticFragmentPath(doc, win)
  const idleTimeoutMs = resolveFragmentBootstrapIdleTimeout(staticPath)
  const useStoreFastBootstrap = isStoreStaticFastBootstrapPath(staticPath)

  const passiveEventOptions: AddEventListenerOptions = { capture: true, passive: true }
  const clickEventOptions: AddEventListenerOptions = { capture: true, passive: false }

  const removeIntentTriggers = () => {
    const handler = useStoreFastBootstrap ? requestStoreBootstrap : requestFragmentBootstrap
    FRAGMENT_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.removeEventListener(eventName, handler, passiveEventOptions)
    })
  }

  const clearFragmentTimeout = () => {
    if (fragmentTimeoutId === null) return
    win.clearTimeout(fragmentTimeoutId)
    fragmentTimeoutId = null
  }

  const clearStoreTimeout = () => {
    if (storeTimeoutId === null) return
    win.clearTimeout(storeTimeoutId)
    storeTimeoutId = null
  }

  const cleanupTriggers = () => {
    removeIntentTriggers()
    doc.removeEventListener('click', handleBootstrapSensitiveClick, clickEventOptions)

    if (loadHandler) {
      win.removeEventListener('load', loadHandler)
      loadHandler = null
    }

    clearFragmentTimeout()
    clearStoreTimeout()
  }

  const startFragmentBootstrap = () => {
    if (fragmentBootstrapped || fragmentBootstrapPromise || win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__) {
      return fragmentBootstrapPromise ?? Promise.resolve()
    }

    cleanupTriggers()
    win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__ = true
    fragmentBootstrapPromise = loadRuntime()
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

  const startStoreBootstrap = () => {
    if (!useStoreFastBootstrap || storeBootstrapped || storeBootstrapPromise) {
      return storeBootstrapPromise ?? Promise.resolve()
    }

    clearStoreTimeout()
    storeBootstrapPromise = loadStoreRuntime()
      .then(({ bootstrapStaticStoreShell }) => bootstrapStaticStoreShell())
      .then(() => {
        storeBootstrapped = true
        removeIntentTriggers()
      })
      .catch((error) => {
        storeBootstrapPromise = null
        throw error
      })

    return storeBootstrapPromise
  }

  function requestFragmentBootstrap() {
    fragmentBootstrapRequested = true
    if (!armed) return
    void startFragmentBootstrap().catch((error) => {
      console.error('Static fragment bootstrap failed:', error)
    })
  }

  function requestStoreBootstrap() {
    if (!useStoreFastBootstrap) {
      requestFragmentBootstrap()
      return
    }
    storeBootstrapRequested = true
    if (!armed) return
    void startStoreBootstrap().catch((error) => {
      console.error('Static store bootstrap failed:', error)
    })
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

    if (useStoreFastBootstrap) {
      if (storeBootstrapped) return
      event.preventDefault()
      event.stopImmediatePropagation()
      requestStoreBootstrap()
      void startStoreBootstrap()
        .then(() => {
          replayDeferredInteraction(target)
        })
        .catch((error) => {
          console.error('Static store bootstrap failed:', error)
        })
      return
    }

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
  }

  const armIdleTrigger = () => {
    if (useStoreFastBootstrap) {
      if (!storeBootstrapped && !storeBootstrapPromise) {
        storeTimeoutId = win.setTimeout(requestStoreBootstrap, idleTimeoutMs)
      }
      return
    }

    if (fragmentBootstrapped || fragmentBootstrapPromise) return
    fragmentTimeoutId = win.setTimeout(requestFragmentBootstrap, idleTimeoutMs)
  }

  const setupBootstrapTriggers = () => {
    if (armed || fragmentBootstrapped || fragmentBootstrapPromise || win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__) return
    armed = true
    const intentHandler = useStoreFastBootstrap ? requestStoreBootstrap : requestFragmentBootstrap
    FRAGMENT_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.addEventListener(eventName, intentHandler, passiveEventOptions)
    })
    doc.addEventListener('click', handleBootstrapSensitiveClick, clickEventOptions)
    if (useStoreFastBootstrap && storeBootstrapRequested) {
      requestStoreBootstrap()
      return
    }
    if (fragmentBootstrapRequested) {
      requestFragmentBootstrap()
      return
    }
    armIdleTrigger()
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

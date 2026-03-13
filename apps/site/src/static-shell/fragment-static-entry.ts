import { loadFragmentBootstrapRuntime } from './fragment-bootstrap-runtime-loader'

export const FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS = 5000
export const FRAGMENT_BOOTSTRAP_INTENT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focusin'] as const

type FragmentStaticEntryWindow = Window & {
  __PROM_STATIC_FRAGMENT_BOOTSTRAP__?: boolean
  __PROM_STATIC_FRAGMENT_ENTRY__?: boolean
}

type FragmentStaticEntryDocument = Document

type InstallFragmentStaticEntryOptions = {
  doc?: FragmentStaticEntryDocument | null
  loadRuntime?: typeof loadFragmentBootstrapRuntime
  win?: FragmentStaticEntryWindow | null
}

const STATIC_FRAGMENT_INTERACTIVE_SELECTOR = [
  '[data-static-fragment-root] button',
  '[data-static-fragment-root] input',
  '[data-static-fragment-root] select',
  '[data-static-fragment-root] textarea',
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
  win = typeof window !== 'undefined' ? (window as FragmentStaticEntryWindow) : null
}: InstallFragmentStaticEntryOptions = {}) => {
  if (!win || !doc) {
    return () => undefined
  }

  win.__PROM_STATIC_FRAGMENT_ENTRY__ = true

  let armed = false
  let bootstrapRequested = false
  let bootstrapped = false
  let bootstrapPromise: Promise<void> | null = null
  let loadHandler: (() => void) | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const passiveEventOptions: AddEventListenerOptions = { capture: true, passive: true }
  const clickEventOptions: AddEventListenerOptions = { capture: true, passive: false }

  const cleanupTriggers = () => {
    FRAGMENT_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.removeEventListener(eventName, requestBootstrap, passiveEventOptions)
    })
    doc.removeEventListener('click', handleBootstrapSensitiveClick, clickEventOptions)

    if (loadHandler) {
      win.removeEventListener('load', loadHandler)
      loadHandler = null
    }

    if (timeoutId !== null) {
      win.clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const startBootstrap = () => {
    if (bootstrapped || bootstrapPromise || win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__) {
      return bootstrapPromise ?? Promise.resolve()
    }

    cleanupTriggers()
    win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__ = true
    bootstrapPromise = loadRuntime()
      .then(({ bootstrapStaticFragmentShell }) => bootstrapStaticFragmentShell())
      .then(() => {
        bootstrapped = true
      })
      .catch((error) => {
        win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__ = false
        throw error
      })

    return bootstrapPromise
  }

  function requestBootstrap() {
    bootstrapRequested = true
    if (!armed) return
    void startBootstrap().catch((error) => {
      console.error('Static fragment bootstrap failed:', error)
    })
  }

  function handleBootstrapSensitiveClick(event: Event) {
    if (bootstrapped) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest(STATIC_FRAGMENT_INTERACTIVE_SELECTOR)) return

    event.preventDefault()
    event.stopImmediatePropagation()
    requestBootstrap()
    void startBootstrap()
      .then(() => {
        replayDeferredInteraction(target)
      })
      .catch((error) => {
        console.error('Static fragment bootstrap failed:', error)
      })
  }

  const armIdleTrigger = () => {
    if (bootstrapped || bootstrapPromise) return
    timeoutId = win.setTimeout(requestBootstrap, FRAGMENT_BOOTSTRAP_IDLE_TIMEOUT_MS)
  }

  const setupBootstrapTriggers = () => {
    if (armed || bootstrapped || bootstrapPromise || win.__PROM_STATIC_FRAGMENT_BOOTSTRAP__) return
    armed = true
    FRAGMENT_BOOTSTRAP_INTENT_EVENTS.forEach((eventName) => {
      win.addEventListener(eventName, requestBootstrap, passiveEventOptions)
    })
    doc.addEventListener('click', handleBootstrapSensitiveClick, clickEventOptions)
    if (bootstrapRequested) {
      requestBootstrap()
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

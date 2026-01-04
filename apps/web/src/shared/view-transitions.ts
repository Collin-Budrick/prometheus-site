export type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> }
}

let activeLangTransitions = 0
const DEFAULT_MUTATION_TIMEOUT = 240

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    requestAnimationFrame(() => resolve())
  })

const waitForPaint = async () => {
  await Promise.resolve()
  await nextFrame()
  await nextFrame()
}

const waitForMutation = (root?: Element | null, timeoutMs = DEFAULT_MUTATION_TIMEOUT) =>
  new Promise<void>((resolve) => {
    if (!root || typeof MutationObserver === 'undefined') {
      waitForPaint().then(resolve)
      return
    }

    let settled = false
    let timeout: number | null = null
    let observer: MutationObserver | null = null
    const finalize = () => {
      if (settled) return
      settled = true
      observer?.disconnect()
      if (timeout !== null) {
        window.clearTimeout(timeout)
      }
      resolve()
    }

    observer = new MutationObserver(() => {
      finalize()
    })

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    })

    timeout = window.setTimeout(() => {
      finalize()
    }, timeoutMs)
  })

const supportsViewTransitions = () => {
  if (typeof document === 'undefined') return false
  const doc = document as DocumentWithViewTransition
  if (typeof doc.startViewTransition !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: no-preference)').matches
}

type ViewTransitionOptions = {
  mutationRoot?: Element | null
  timeoutMs?: number
}

export const runLangViewTransition = (update: () => void | Promise<void>, options: ViewTransitionOptions = {}) => {
  if (!supportsViewTransitions()) {
    return Promise.resolve(update())
  }

  const root = document.documentElement
  activeLangTransitions += 1
  root.dataset.langTransition = 'swap'

  const doc = document as DocumentWithViewTransition

  try {
    const transition = doc.startViewTransition(async () => {
      const mutationRoot = options.mutationRoot ?? document.body
      const timeoutMs = options.timeoutMs ?? DEFAULT_MUTATION_TIMEOUT
      const mutation = waitForMutation(mutationRoot, timeoutMs)
      await Promise.resolve(update())
      await mutation
    })
    const finalize = () => {
      activeLangTransitions = Math.max(0, activeLangTransitions - 1)
      if (activeLangTransitions === 0) {
        delete root.dataset.langTransition
      }
    }
    transition.finished.then(finalize).catch(finalize)
    return transition.finished
  } catch {
    activeLangTransitions = Math.max(0, activeLangTransitions - 1)
    if (activeLangTransitions === 0) {
      delete root.dataset.langTransition
    }
    return Promise.resolve(update())
  }
}

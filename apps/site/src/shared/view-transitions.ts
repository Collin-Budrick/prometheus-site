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

type MutationMode = 'any' | 'all'
type ViewTransitionVariant = 'ui' | 'fragments'

type ViewTransitionOptions = {
  mutationRoot?: Element | null
  mutationRoots?: Array<Element | null | undefined>
  timeoutMs?: number
  mode?: MutationMode
  variant?: ViewTransitionVariant
}

const waitForMutations = (roots: Element[], timeoutMs: number, mode: MutationMode) => {
  if (!roots.length) return waitForPaint()
  const waits = roots.map((root) => waitForMutation(root, timeoutMs))
  return mode === 'all' ? Promise.all(waits).then(() => {}) : Promise.race(waits)
}

export const runLangViewTransition = (update: () => void | Promise<void>, options: ViewTransitionOptions = {}) => {
  if (!supportsViewTransitions() || activeLangTransitions > 0) {
    return Promise.resolve(update())
  }

  const root = document.documentElement
  const variant: ViewTransitionVariant = options.variant ?? 'ui'
  activeLangTransitions += 1
  root.dataset.langTransition = variant

  const doc = document as DocumentWithViewTransition

  try {
    const transition = doc.startViewTransition(async () => {
      const timeoutMs = options.timeoutMs ?? DEFAULT_MUTATION_TIMEOUT
      const mode = options.mode ?? 'any'
      const roots = (options.mutationRoots ?? [options.mutationRoot ?? document.body]).filter(
        (root): root is Element => Boolean(root)
      )
      const mutation = waitForMutations(roots, timeoutMs, mode)
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


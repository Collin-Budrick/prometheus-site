export const READY_STAGGER_STATE_ATTR = 'data-ready-stagger-state'
export const READY_STAGGER_DELAY_VAR = '--ready-stagger-delay'
export const READY_STAGGER_DURATION_MS = 320
export const READY_STAGGER_STEP_MS = 45
export const READY_STAGGER_MAX_DELAY_MS = 135
const READY_STAGGER_RESET_MS = 220
const READY_STAGGER_VISIBILITY_ROOT_MARGIN = '0px'
const READY_STAGGER_VISIBILITY_THRESHOLD = 0

type ReadyStaggerBatchState = {
  nextIndex: number
  resetTimer: ReturnType<typeof setTimeout> | null
}

type ClaimReadyStaggerDelayOptions = {
  group?: string
  stepMs?: number
  maxDelayMs?: number
  resetMs?: number
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

type QueueReadyStaggerOptions = ClaimReadyStaggerDelayOptions & {
  immediate?: boolean
  replay?: boolean
  requestFrame?: typeof requestAnimationFrame
  win?: Window | null
}

type QueueReadyStaggerOnVisibleOptions = QueueReadyStaggerOptions & {
  ObserverImpl?: typeof IntersectionObserver
  rootMargin?: string
  threshold?: number
}

type ReleaseQueuedReadyStaggerWithinOptions = QueueReadyStaggerOnVisibleOptions & {
  root?: ParentNode
  queuedSelector: string
}

const readyStaggerBatches = new Map<string, ReadyStaggerBatchState>()
const readyStaggerVisibilityObservers = new Map<HTMLElement, { disconnect: () => void }>()

const clearReadyStaggerVisibilityObserver = (element: HTMLElement) => {
  readyStaggerVisibilityObservers.get(element)?.disconnect()
  readyStaggerVisibilityObservers.delete(element)
}

export const resolveReadyStaggerDelay = (index: number, stepMs = READY_STAGGER_STEP_MS, maxDelayMs = READY_STAGGER_MAX_DELAY_MS) =>
  Math.min(Math.max(index, 0) * stepMs, maxDelayMs)

export const shouldSkipReadyStagger = (
  win: Window | null = typeof window !== 'undefined' ? window : null
) => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

export const claimReadyStaggerDelay = ({
  group = 'default',
  stepMs = READY_STAGGER_STEP_MS,
  maxDelayMs = READY_STAGGER_MAX_DELAY_MS,
  resetMs = READY_STAGGER_RESET_MS,
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis)
}: ClaimReadyStaggerDelayOptions = {}) => {
  const batch = readyStaggerBatches.get(group) ?? { nextIndex: 0, resetTimer: null }
  const delayMs = resolveReadyStaggerDelay(batch.nextIndex, stepMs, maxDelayMs)
  batch.nextIndex += 1
  if (batch.resetTimer && typeof clearTimer === 'function') {
    clearTimer(batch.resetTimer)
  }
  batch.resetTimer =
    typeof setTimer === 'function'
      ? setTimer(() => {
          readyStaggerBatches.delete(group)
        }, resetMs)
      : null
  readyStaggerBatches.set(group, batch)
  return delayMs
}

export const applyImmediateReadyStagger = (element: HTMLElement) => {
  clearReadyStaggerVisibilityObserver(element)
  element.style.setProperty(READY_STAGGER_DELAY_VAR, '0ms')
  element.setAttribute(READY_STAGGER_STATE_ATTR, 'done')
}

export const queueReadyStagger = (element: HTMLElement, options: QueueReadyStaggerOptions = {}) => {
  clearReadyStaggerVisibilityObserver(element)
  const {
    group = 'default',
    immediate = false,
    replay = false,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    win = typeof window !== 'undefined' ? window : null
  } = options

  if (!replay && element.getAttribute(READY_STAGGER_STATE_ATTR) === 'done') {
    return Number.parseInt(element.style.getPropertyValue(READY_STAGGER_DELAY_VAR) || '0', 10) || 0
  }

  if (immediate || shouldSkipReadyStagger(win)) {
    applyImmediateReadyStagger(element)
    return 0
  }

  const delayMs = claimReadyStaggerDelay(options)
  element.style.setProperty(READY_STAGGER_DELAY_VAR, `${delayMs}ms`)
  element.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')

  const release = () => {
    if (!element.isConnected) return
    element.setAttribute(READY_STAGGER_STATE_ATTR, 'done')
  }

  if (typeof requestFrame === 'function') {
    requestFrame(release)
  } else {
    release()
  }

  return delayMs
}

export const isReadyStaggerElementVisible = (element: HTMLElement) => {
  if (typeof element.getBoundingClientRect !== 'function') {
    return true
  }

  const rect = element.getBoundingClientRect()
  const doc = typeof document !== 'undefined' ? document : null
  const viewportWidth =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : doc?.documentElement?.clientWidth ?? 0
  const viewportHeight =
    typeof window !== 'undefined' && typeof window.innerHeight === 'number'
      ? window.innerHeight
      : doc?.documentElement?.clientHeight ?? 0

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return true
  }

  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth
}

export const queueReadyStaggerOnVisible = (element: HTMLElement, options: QueueReadyStaggerOnVisibleOptions = {}) => {
  const {
    ObserverImpl = (
      globalThis as typeof globalThis & {
        IntersectionObserver?: typeof IntersectionObserver
      }
    ).IntersectionObserver,
    rootMargin = READY_STAGGER_VISIBILITY_ROOT_MARGIN,
    threshold = READY_STAGGER_VISIBILITY_THRESHOLD
  } = options

  if (options.immediate || shouldSkipReadyStagger(options.win)) {
    return queueReadyStagger(element, options)
  }

  element.style.setProperty(READY_STAGGER_DELAY_VAR, '0ms')
  element.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')

  if (typeof ObserverImpl !== 'function') {
    if (isReadyStaggerElementVisible(element)) {
      return queueReadyStagger(element, options)
    }
    return queueReadyStagger(element, {
      ...options,
      immediate: true
    })
  }

  clearReadyStaggerVisibilityObserver(element)

  const observer = new ObserverImpl(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
        return
      }
      clearReadyStaggerVisibilityObserver(element)
      queueReadyStagger(element, options)
    },
    {
      root: null,
      rootMargin,
      threshold
    }
  )

  observer.observe(element)
  readyStaggerVisibilityObservers.set(element, {
    disconnect: () => observer.disconnect()
  })

  return 0
}

export const releaseQueuedReadyStaggerWithin = ({
  root = typeof document !== 'undefined' ? document : undefined,
  queuedSelector,
  ...options
}: ReleaseQueuedReadyStaggerWithinOptions) => {
  if (!root) return

  Array.from(root.querySelectorAll<HTMLElement>(queuedSelector)).forEach((element) => {
    if (element.getAttribute(READY_STAGGER_STATE_ATTR) !== 'queued') {
      return
    }
    queueReadyStaggerOnVisible(element, {
      ...options,
      replay: true
    })
  })
}

export const resetReadyStaggerBatchesForTests = () => {
  readyStaggerVisibilityObservers.forEach((observer) => {
    observer.disconnect()
  })
  readyStaggerVisibilityObservers.clear()
  readyStaggerBatches.forEach((batch) => {
    if (batch.resetTimer && typeof clearTimeout === 'function') {
      clearTimeout(batch.resetTimer)
    }
  })
  readyStaggerBatches.clear()
}

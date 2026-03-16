export const READY_STAGGER_STATE_ATTR = 'data-ready-stagger-state'
export const READY_STAGGER_DELAY_VAR = '--ready-stagger-delay'
export const READY_STAGGER_DURATION_MS = 180
export const READY_STAGGER_STEP_MS = 24
export const READY_STAGGER_MAX_DELAY_MS = 72
const READY_STAGGER_RESET_MS = 220
const READY_STAGGER_VISIBILITY_ROOT_MARGIN = '0px'
const READY_STAGGER_VISIBILITY_THRESHOLD = 0

export type ReadyStaggerState = 'queued' | 'done'
export type ReadyStaggerStateChangeHandler = (state: ReadyStaggerState, delayMs: number) => void

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
  onStateChange?: ReadyStaggerStateChangeHandler
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

type ScheduleReleaseQueuedReadyStaggerWithinOptions = ReleaseQueuedReadyStaggerWithinOptions & {
  cancelFrame?: typeof cancelAnimationFrame
}

const readyStaggerBatches = new Map<string, ReadyStaggerBatchState>()
const readyStaggerVisibilityObservers = new Map<HTMLElement, { disconnect: () => void }>()
const scheduledReadyStaggerReleases = new Map<ParentNode, Map<string, () => void>>()

const clearReadyStaggerVisibilityObserver = (element: HTMLElement) => {
  readyStaggerVisibilityObservers.get(element)?.disconnect()
  readyStaggerVisibilityObservers.delete(element)
}

const setReadyStaggerState = (
  element: HTMLElement,
  state: ReadyStaggerState,
  delayMs: number,
  onStateChange?: ReadyStaggerStateChangeHandler
) => {
  element.style.setProperty(READY_STAGGER_DELAY_VAR, `${Math.max(delayMs, 0)}ms`)
  element.setAttribute(READY_STAGGER_STATE_ATTR, state)
  onStateChange?.(state, Math.max(delayMs, 0))
}

const resolveReadyStaggerSortPosition = (value: {
  target?: EventTarget | null
  boundingClientRect?: Pick<DOMRectReadOnly, 'top' | 'left'> | null
}) => {
  const rect = value.boundingClientRect
  if (rect && Number.isFinite(rect.top) && Number.isFinite(rect.left)) {
    return {
      top: rect.top,
      left: rect.left
    }
  }

  const target = value.target
  if (target && typeof (target as Element).getBoundingClientRect === 'function') {
    const targetRect = (target as Element).getBoundingClientRect()
    return {
      top: Number.isFinite(targetRect.top) ? targetRect.top : 0,
      left: Number.isFinite(targetRect.left) ? targetRect.left : 0
    }
  }

  return {
    top: 0,
    left: 0
  }
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

export const applyImmediateReadyStagger = (
  element: HTMLElement,
  onStateChange?: ReadyStaggerStateChangeHandler
) => {
  clearReadyStaggerVisibilityObserver(element)
  setReadyStaggerState(element, 'done', 0, onStateChange)
}

export const clearReadyStaggerObserverForElement = (element: HTMLElement) => {
  clearReadyStaggerVisibilityObserver(element)
}

export const queueReadyStagger = (element: HTMLElement, options: QueueReadyStaggerOptions = {}) => {
  clearReadyStaggerVisibilityObserver(element)
  const {
    group = 'default',
    immediate = false,
    onStateChange,
    replay = false,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    win = typeof window !== 'undefined' ? window : null
  } = options

  if (!replay && element.getAttribute(READY_STAGGER_STATE_ATTR) === 'done') {
    return Number.parseInt(element.style.getPropertyValue(READY_STAGGER_DELAY_VAR) || '0', 10) || 0
  }

  if (immediate || shouldSkipReadyStagger(win)) {
    applyImmediateReadyStagger(element, onStateChange)
    return 0
  }

  const delayMs = claimReadyStaggerDelay(options)
  setReadyStaggerState(element, 'queued', delayMs, onStateChange)

  const release = () => {
    if (!element.isConnected) return
    setReadyStaggerState(element, 'done', delayMs, onStateChange)
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
    onStateChange,
    rootMargin = READY_STAGGER_VISIBILITY_ROOT_MARGIN,
    threshold = READY_STAGGER_VISIBILITY_THRESHOLD
  } = options

  if (options.immediate || shouldSkipReadyStagger(options.win)) {
    return queueReadyStagger(element, options)
  }

  setReadyStaggerState(element, 'queued', 0, onStateChange)

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
  const queuedElements = Array.from(root.querySelectorAll<HTMLElement>(queuedSelector)).filter(
    (element) => element.getAttribute(READY_STAGGER_STATE_ATTR) === 'queued'
  )
  if (!queuedElements.length) return

  const {
    ObserverImpl = (
      globalThis as typeof globalThis & {
        IntersectionObserver?: typeof IntersectionObserver
      }
    ).IntersectionObserver,
    rootMargin = READY_STAGGER_VISIBILITY_ROOT_MARGIN,
    threshold = READY_STAGGER_VISIBILITY_THRESHOLD,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis)
  } = options

  if (options.immediate || shouldSkipReadyStagger(options.win)) {
    queuedElements.forEach((element) => {
      queueReadyStagger(element, {
        ...options,
        replay: true
      })
    })
    return
  }

  if (typeof ObserverImpl !== 'function') {
    const visibleElements: HTMLElement[] = []
    const offscreenElements: HTMLElement[] = []

    queuedElements.forEach((element) => {
      if (isReadyStaggerElementVisible(element)) {
        visibleElements.push(element)
        return
      }
      offscreenElements.push(element)
    })

    visibleElements
      .sort((first, second) => {
        const firstPosition = resolveReadyStaggerSortPosition({ target: first })
        const secondPosition = resolveReadyStaggerSortPosition({ target: second })
        if (Math.abs(firstPosition.top - secondPosition.top) > 1) {
          return firstPosition.top - secondPosition.top
        }
        if (Math.abs(firstPosition.left - secondPosition.left) > 1) {
          return firstPosition.left - secondPosition.left
        }
        return queuedElements.indexOf(first) - queuedElements.indexOf(second)
      })
      .forEach((element) => {
        queueReadyStagger(element, {
          ...options,
          replay: true
        })
      })

    offscreenElements.forEach((element) => {
      queueReadyStagger(element, {
        ...options,
        replay: true,
        immediate: true
      })
    })
    return
  }

  const pendingElements = new Set(queuedElements)
  const pendingEntries = new Map<HTMLElement, IntersectionObserverEntry>()
  let flushScheduled = false

  const cleanupElementObserver = (element: HTMLElement) => {
    pendingEntries.delete(element)
    pendingElements.delete(element)
    readyStaggerVisibilityObservers.delete(element)
    if (typeof (observer as IntersectionObserver).unobserve === 'function') {
      observer.unobserve(element)
    }
    if (pendingElements.size === 0) {
      observer.disconnect()
      flushScheduled = false
    }
  }

  const releaseElement = (element: HTMLElement) => {
    const isConnected = element.isConnected
    cleanupElementObserver(element)
    if (!isConnected) return
    queueReadyStagger(element, {
      ...options,
      replay: true
    })
  }

  const flushVisibleElements = () => {
    flushScheduled = false
    Array.from(pendingEntries.values())
      .sort((first, second) => {
        const firstPosition = resolveReadyStaggerSortPosition(first)
        const secondPosition = resolveReadyStaggerSortPosition(second)
        if (Math.abs(firstPosition.top - secondPosition.top) > 1) {
          return firstPosition.top - secondPosition.top
        }
        if (Math.abs(firstPosition.left - secondPosition.left) > 1) {
          return firstPosition.left - secondPosition.left
        }
        return queuedElements.indexOf(first.target as HTMLElement) - queuedElements.indexOf(second.target as HTMLElement)
      })
      .forEach((entry) => {
        const element = entry.target as HTMLElement
        if (!pendingElements.has(element)) {
          return
        }
        releaseElement(element)
      })
  }

  const scheduleFlush = () => {
    if (flushScheduled) return
    flushScheduled = true
    if (typeof requestFrame === 'function') {
      requestFrame(() => {
        flushVisibleElements()
      })
      return
    }
    flushVisibleElements()
  }

  const observer = new ObserverImpl(
    (entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement
        if (!pendingElements.has(element)) {
          return
        }
        if (!entry.isIntersecting && entry.intersectionRatio <= 0) {
          pendingEntries.delete(element)
          return
        }
        pendingEntries.set(element, entry)
      })
      scheduleFlush()
    },
    {
      root: null,
      rootMargin,
      threshold
    }
  )

  queuedElements.forEach((element) => {
    clearReadyStaggerVisibilityObserver(element)
    observer.observe(element)
    readyStaggerVisibilityObservers.set(element, {
      disconnect: () => {
        cleanupElementObserver(element)
      }
    })
  })
}

export const scheduleReleaseQueuedReadyStaggerWithin = ({
  root = typeof document !== 'undefined' ? document : undefined,
  queuedSelector,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  ...options
}: ScheduleReleaseQueuedReadyStaggerWithinOptions) => {
  if (!root) {
    return () => undefined
  }

  const key = `${queuedSelector}::${options.group ?? 'default'}`
  const pendingForRoot = scheduledReadyStaggerReleases.get(root) ?? new Map<string, () => void>()
  const existing = pendingForRoot.get(key)
  if (existing) {
    return existing
  }

  let frameId = 0
  let cancelled = false

  const clear = () => {
    if (cancelled) return
    cancelled = true
    if (frameId && typeof cancelFrame === 'function') {
      cancelFrame(frameId)
    }
    const current = scheduledReadyStaggerReleases.get(root)
    current?.delete(key)
    if (current && current.size === 0) {
      scheduledReadyStaggerReleases.delete(root)
    }
  }

  const flush = () => {
    clear()
    releaseQueuedReadyStaggerWithin({
      root,
      queuedSelector,
      requestFrame,
      ...options
    })
  }

  pendingForRoot.set(key, clear)
  scheduledReadyStaggerReleases.set(root, pendingForRoot)

  if (typeof requestFrame === 'function') {
    frameId = requestFrame(() => {
      flush()
    })
    return clear
  }

  flush()
  return () => undefined
}

export const resetReadyStaggerBatchesForTests = () => {
  scheduledReadyStaggerReleases.forEach((pendingForRoot) => {
    pendingForRoot.forEach((cancel) => {
      cancel()
    })
  })
  scheduledReadyStaggerReleases.clear()
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

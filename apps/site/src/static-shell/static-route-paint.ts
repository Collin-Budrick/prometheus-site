type StaticRoutePaintRoot = ParentNode | Element | null

type ScheduleStaticRoutePaintReadyOptions = {
  root?: StaticRoutePaintRoot
  readyAttr: string
  requestFrame?: typeof requestAnimationFrame
  cancelFrame?: typeof cancelAnimationFrame
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
  onReady?: () => void
}

const resolveElementRoot = (root: StaticRoutePaintRoot) => {
  if (
    !root ||
    typeof (root as Element).getAttribute !== 'function' ||
    typeof (root as Element).setAttribute !== 'function'
  ) {
    return null
  }
  return root as Element
}

export const scheduleStaticRoutePaintReady = ({
  root,
  readyAttr,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
  onReady
}: ScheduleStaticRoutePaintReadyOptions) => {
  const staticRoot = resolveElementRoot(root)
  if (!staticRoot) return () => undefined
  if (staticRoot.getAttribute(readyAttr) === 'ready') {
    onReady?.()
    return () => undefined
  }

  if (typeof requestFrame !== 'function') {
    staticRoot.setAttribute(readyAttr, 'ready')
    onReady?.()
    return () => undefined
  }

  let firstFrame = 0
  let secondFrame = 0
  let fallbackTimer: ReturnType<typeof setTimeout> | 0 = 0
  let cancelled = false

  const markReady = () => {
    if (cancelled) return
    const liveRoot = resolveElementRoot(root)
    if (!liveRoot) return
    liveRoot.setAttribute(readyAttr, 'ready')
    onReady?.()
  }

  firstFrame = requestFrame(() => {
    if (cancelled) return
    secondFrame = requestFrame(markReady)
  })

  if (typeof setTimer === 'function') {
    fallbackTimer = setTimer(markReady, 180)
  }

  return () => {
    cancelled = true
    if (typeof cancelFrame === 'function') {
      if (firstFrame) cancelFrame(firstFrame)
      if (secondFrame) cancelFrame(secondFrame)
    }
    if (fallbackTimer && typeof clearTimer === 'function') {
      clearTimer(fallbackTimer)
    }
  }
}

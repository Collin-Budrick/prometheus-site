type StaticRoutePaintRoot = ParentNode | Element | null
type StaticRoutePaintFrameRequest = (callback: FrameRequestCallback) => number
type StaticRoutePaintFrameCancel = (handle: number) => void
type StaticRoutePaintTimerHandle = number | ReturnType<typeof globalThis.setTimeout>
type StaticRoutePaintSetTimer = (handler: () => void, timeout?: number) => StaticRoutePaintTimerHandle
type StaticRoutePaintClearTimer = (handle: StaticRoutePaintTimerHandle) => void

type ScheduleStaticRoutePaintReadyOptions = {
  root?: StaticRoutePaintRoot
  readyAttr: string
  requestFrame?: StaticRoutePaintFrameRequest
  cancelFrame?: StaticRoutePaintFrameCancel
  setTimer?: StaticRoutePaintSetTimer
  clearTimer?: StaticRoutePaintClearTimer
  onReady?: () => void
}

const resolveElementRoot = (root?: StaticRoutePaintRoot) => {
  if (
    !root ||
    typeof (root as Element).getAttribute !== 'function' ||
    typeof (root as Element).setAttribute !== 'function'
  ) {
    return null
  }
  return root as Element
}

const isTimerHandle = (
  value: StaticRoutePaintTimerHandle | 0
): value is StaticRoutePaintTimerHandle => value !== 0

export const scheduleStaticRoutePaintReady = ({
  root,
  readyAttr,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) as StaticRoutePaintFrameRequest | undefined,
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) as StaticRoutePaintFrameCancel | undefined,
  setTimer = globalThis.setTimeout?.bind(globalThis) as StaticRoutePaintSetTimer | undefined,
  clearTimer = globalThis.clearTimeout?.bind(globalThis) as StaticRoutePaintClearTimer | undefined,
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

  let frameHandle = 0
  let fallbackTimer: StaticRoutePaintTimerHandle | 0 = 0
  let cancelled = false

  const markReady = () => {
    if (cancelled) return
    const liveRoot = resolveElementRoot(root)
    if (!liveRoot) return
    liveRoot.setAttribute(readyAttr, 'ready')
    onReady?.()
  }

  frameHandle = requestFrame(markReady)

  if (typeof setTimer === 'function') {
    fallbackTimer = setTimer(markReady, 180)
  }

  return () => {
    cancelled = true
    if (typeof cancelFrame === 'function') {
      if (frameHandle) cancelFrame(frameHandle)
    }
    if (isTimerHandle(fallbackTimer) && typeof clearTimer === 'function') {
      clearTimer(fallbackTimer)
    }
  }
}

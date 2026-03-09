export const INITIAL_LAYOUT_SETTLE_DEBOUNCE_MS = 120
export const INITIAL_LAYOUT_SETTLE_FALLBACK_MS = 900

type TimerHandle = number

type InitialLayoutSettleSchedulerOptions = {
  setTimeout: (callback: () => void, delay: number) => TimerHandle
  clearTimeout: (handle: TimerHandle) => void
  onSettled: () => void
  isSettled?: () => boolean
  debounceMs?: number
  fallbackMs?: number
}

export type InitialLayoutSettleScheduler = {
  arm: () => void
  noteStableHeight: () => void
  dispose: () => void
}

export const createInitialLayoutSettleScheduler = ({
  setTimeout,
  clearTimeout,
  onSettled,
  isSettled = () => false,
  debounceMs = INITIAL_LAYOUT_SETTLE_DEBOUNCE_MS,
  fallbackMs = INITIAL_LAYOUT_SETTLE_FALLBACK_MS
}: InitialLayoutSettleSchedulerOptions): InitialLayoutSettleScheduler => {
  let settleTimer = 0
  let fallbackTimer = 0

  const clearSettleTimer = () => {
    if (!settleTimer) return
    clearTimeout(settleTimer)
    settleTimer = 0
  }

  const clearFallbackTimer = () => {
    if (!fallbackTimer) return
    clearTimeout(fallbackTimer)
    fallbackTimer = 0
  }

  const settle = () => {
    clearSettleTimer()
    clearFallbackTimer()
    if (isSettled()) return
    onSettled()
  }

  return {
    arm: () => {
      if (fallbackTimer || isSettled()) return
      fallbackTimer = setTimeout(settle, fallbackMs)
    },
    noteStableHeight: () => {
      if (isSettled()) return
      clearSettleTimer()
      settleTimer = setTimeout(settle, debounceMs)
    },
    dispose: () => {
      clearSettleTimer()
      clearFallbackTimer()
    }
  }
}

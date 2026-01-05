type IdleHandles = {
  idle: number | null
  timeout: number | null
}

/**
 * Schedule work when the browser is idle with a timeout-based fallback for environments
 * where `requestIdleCallback` is unavailable.
 */
export const scheduleIdleTask = (callback: () => void, timeout = 120) => {
  const handles: IdleHandles = { idle: null, timeout: null }
  let cancelled = false
  let fired = false

  const run = () => {
    if (cancelled || fired) return
    fired = true
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
    if (handles.idle !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(handles.idle)
    }
    handles.idle = null
    handles.timeout = null
    callback()
  }

  if ('requestIdleCallback' in window) {
    handles.idle = window.requestIdleCallback(run)
  }

  handles.timeout = window.setTimeout(() => {
    run()
  }, timeout)

  return () => {
    cancelled = true
    if (handles.idle !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(handles.idle)
    }
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
  }
}

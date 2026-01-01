type IdleHandles = {
  idle: number | null
  timeout: ReturnType<typeof setTimeout> | null
}

/**
 * Schedule work when the browser is idle with a timeout-based fallback for environments
 * where `requestIdleCallback` is unavailable.
 */
export const scheduleIdleTask = (callback: () => void, timeout = 120) => {
  const handles: IdleHandles = { idle: null, timeout: null }
  let cancelled = false

  const run = () => {
    if (cancelled) return
    handles.idle = null
    handles.timeout = null
    callback()
  }

  if ('requestIdleCallback' in window) {
    handles.idle = window.requestIdleCallback(run)
  }

  handles.timeout = window.setTimeout(() => {
    if (handles.idle !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(handles.idle)
    }
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

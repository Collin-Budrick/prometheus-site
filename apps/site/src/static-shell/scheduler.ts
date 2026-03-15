type TaskPriority = 'background' | 'user-visible' | 'user-blocking'

type ScheduleStaticShellTaskOptions = {
  delayMs?: number
  priority?: TaskPriority
  timeoutMs?: number
  preferIdle?: boolean
  waitForLoad?: boolean
  waitForPaint?: boolean
}

type TaskControllerConstructor = new (options?: { priority?: TaskPriority }) => AbortController

type SchedulerLike = {
  postTask?: (
    callback: () => void,
    options?: { priority?: TaskPriority; signal?: AbortSignal }
  ) => Promise<void>
  yield?: (options?: { priority?: TaskPriority }) => Promise<void>
}

type SchedulerGlobals = typeof globalThis & {
  scheduler?: SchedulerLike
  TaskController?: TaskControllerConstructor
}

type IdleHandles = {
  timeout: number | null
  idle: number | null
}

const scheduleIdleTask = (
  callback: () => void,
  timeout = 120,
  priority: TaskPriority = 'background',
  preferIdle = true
) => {
  const globals = globalThis as SchedulerGlobals
  const scheduler = globals.scheduler
  const TaskControllerImpl = globals.TaskController ?? AbortController
  const postTask = scheduler?.postTask?.bind(scheduler)
  const yieldTask = scheduler?.yield?.bind(scheduler)
  const controller = new TaskControllerImpl()
  const handles: IdleHandles = { timeout: null, idle: null }
  const idleApi =
    typeof window !== 'undefined'
      ? (window as {
          requestIdleCallback?: (
            callback: IdleRequestCallback,
            options?: { timeout?: number }
          ) => number
          cancelIdleCallback?: (handle: number) => void
        })
      : null
  let cancelled = false
  let fired = false

  const run = () => {
    if (cancelled || fired) return
    fired = true
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
    if (handles.idle !== null && idleApi?.cancelIdleCallback) {
      idleApi.cancelIdleCallback(handles.idle)
    }
    handles.timeout = null
    handles.idle = null
    callback()
  }

  if (postTask) {
    postTask(run, { priority, signal: controller.signal }).catch(() => {})
  } else if (yieldTask) {
    yieldTask({ priority })
      .then(run)
      .catch(() => {})
  }

  if (typeof window === 'undefined') {
    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }

  if (!preferIdle) {
    handles.timeout = window.setTimeout(run, Math.max(timeout, 0))
  } else if (idleApi?.requestIdleCallback) {
    handles.idle = idleApi.requestIdleCallback(run, { timeout })
  } else {
    handles.timeout = window.setTimeout(run, timeout)
  }

  return () => {
    cancelled = true
    controller.abort()
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
    if (handles.idle !== null && idleApi?.cancelIdleCallback) {
      idleApi.cancelIdleCallback(handles.idle)
    }
  }
}

export const scheduleStaticShellTask = (
  callback: () => void,
  {
    delayMs = 0,
    priority = 'background',
    timeoutMs = 120,
    preferIdle = true,
    waitForLoad = false,
    waitForPaint = false
  }: ScheduleStaticShellTaskOptions = {}
) => {
  if (typeof window === 'undefined') {
    callback()
    return () => undefined
  }

  let cancelled = false
  let timeoutHandle = 0
  let rafHandle = 0
  let afterPaintHandle = 0
  let loadHandler: (() => void) | null = null
  let cancelIdleTask: (() => void) | null = null

  const cleanup = () => {
    cancelled = true
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle)
      timeoutHandle = 0
    }
    if (rafHandle) {
      window.cancelAnimationFrame(rafHandle)
      rafHandle = 0
    }
    if (afterPaintHandle) {
      window.cancelAnimationFrame(afterPaintHandle)
      afterPaintHandle = 0
    }
    if (loadHandler) {
      window.removeEventListener('load', loadHandler)
      loadHandler = null
    }
    cancelIdleTask?.()
    cancelIdleTask = null
  }

  const queueIdle = () => {
    if (cancelled) return
    cancelIdleTask = scheduleIdleTask(() => {
      if (cancelled) return
      callback()
    }, timeoutMs, priority, preferIdle)
  }

  const queueAfterPaint = () => {
    if (cancelled) return
    if (!waitForPaint || typeof window.requestAnimationFrame !== 'function') {
      queueIdle()
      return
    }

    rafHandle = window.requestAnimationFrame(() => {
      rafHandle = 0
      afterPaintHandle = window.requestAnimationFrame(() => {
        afterPaintHandle = 0
        queueIdle()
      })
    })
  }

  const queueAfterDelay = () => {
    if (cancelled) return
    if (delayMs <= 0) {
      queueAfterPaint()
      return
    }
    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = 0
      queueAfterPaint()
    }, delayMs)
  }

  const start = () => {
    if (cancelled) return
    if (waitForLoad && document.readyState !== 'complete') {
      loadHandler = () => {
        loadHandler = null
        queueAfterDelay()
      }
      window.addEventListener('load', loadHandler, { once: true })
      return
    }
    queueAfterDelay()
  }

  start()
  return cleanup
}

type IdleHandles = {
  timeout: number | null
  idle: number | null
}

type TaskPriority = 'background' | 'user-visible' | 'user-blocking'

type TaskControllerConstructor = new (options?: { priority?: TaskPriority }) => AbortController

type SchedulerLike = {
  postTask?: (callback: () => void, options?: { priority?: TaskPriority; signal?: AbortSignal }) => Promise<void>
  yield?: (options?: { priority?: TaskPriority }) => Promise<void>
}

type SchedulerGlobals = typeof globalThis & {
  scheduler?: SchedulerLike
  TaskController?: TaskControllerConstructor
}

const getSchedulerGlobals = () => globalThis as SchedulerGlobals

/**
 * Schedule work when the browser is idle with scheduler-backed prioritization and
 * a timeout-based fallback for environments without task scheduling support.
 */
export const scheduleIdleTask = (
  callback: () => void,
  timeout = 120,
  priority: TaskPriority = 'background'
) => {
  const globals = getSchedulerGlobals()
  const scheduler = globals.scheduler
  const TaskControllerImpl = globals.TaskController ?? AbortController
  const postTask = scheduler?.postTask?.bind(scheduler)
  const yieldTask = scheduler?.yield?.bind(scheduler)
  const handles: IdleHandles = { timeout: null, idle: null }
  const controller = new TaskControllerImpl()
  const idleApi =
    typeof window !== 'undefined'
      ? (window as {
          requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
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

  if (idleApi?.requestIdleCallback) {
    handles.idle = idleApi.requestIdleCallback(run, { timeout })
  } else {
    handles.timeout = window.setTimeout(() => {
      run()
    }, timeout)
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

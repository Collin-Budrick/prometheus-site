type IdleHandles = {
  timeout: number | null
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

let schedulerImport: Promise<void> | null = null

const ensureSchedulerPolyfill = () => {
  if (typeof window === 'undefined') return
  if (schedulerImport) return
  schedulerImport = import('scheduler-polyfill').then(() => {}).catch(() => {})
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
  ensureSchedulerPolyfill()
  const globals = getSchedulerGlobals()
  const scheduler = globals.scheduler
  const TaskControllerImpl = globals.TaskController ?? AbortController
  const postTask = scheduler?.postTask?.bind(scheduler)
  const yieldTask = scheduler?.yield?.bind(scheduler)
  const handles: IdleHandles = { timeout: null }
  const controller = new TaskControllerImpl()
  let cancelled = false
  let fired = false

  const run = () => {
    if (cancelled || fired) return
    fired = true
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
    handles.timeout = null
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

  handles.timeout = window.setTimeout(() => {
    run()
  }, timeout)

  return () => {
    cancelled = true
    controller.abort()
    if (handles.timeout !== null) {
      clearTimeout(handles.timeout)
    }
  }
}

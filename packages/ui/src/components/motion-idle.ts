import 'scheduler-polyfill'

type IdleHandles = {
  timeout: number | null
}

type TaskPriority = 'background' | 'user-visible' | 'user-blocking'

type TaskControllerConstructor = new (options?: { priority?: TaskPriority }) => AbortController

type SchedulerLike = {
  postTask?: (callback: () => void, options?: { priority?: TaskPriority; signal?: AbortSignal }) => Promise<void>
  yield?: (options?: { priority?: TaskPriority }) => Promise<void>
}

const scheduler = (globalThis as typeof globalThis & { scheduler?: SchedulerLike }).scheduler
const TaskControllerImpl =
  (globalThis as typeof globalThis & { TaskController?: TaskControllerConstructor }).TaskController ?? AbortController

const postTask = scheduler?.postTask?.bind(scheduler)
const yieldTask = scheduler?.yield?.bind(scheduler)

/**
 * Schedule work when the browser is idle with scheduler-backed prioritization and
 * a timeout-based fallback for environments without task scheduling support.
 */
export const scheduleIdleTask = (
  callback: () => void,
  timeout = 120,
  priority: TaskPriority = 'background'
) => {
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

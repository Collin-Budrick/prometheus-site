type BootTask = {
  canceled: boolean
  run: () => void
  cancelDeferred?: () => void
}

const DEFAULT_INTENT_TIMEOUT_MS = 7000
const DEFAULT_IDLE_TIMEOUT_MS = 1500
const PASSIVE_INTENT_EVENTS = ['pointerdown', 'touchstart', 'touchmove', 'wheel'] as const
const ACTIVE_INTENT_EVENTS = ['keydown', 'focusin'] as const

export type ClientBootIntentSource =
  | 'pending'
  | 'pointerdown'
  | 'touchstart'
  | 'touchmove'
  | 'wheel'
  | 'keydown'
  | 'focusin'
  | 'timeout'

type ClientBootDebugState = {
  ready: boolean
  source: ClientBootIntentSource
  unlockedAt: number | null
}

let intentReady = false
let intentGateInstalled = false
let intentQueue: BootTask[] = []
let intentSource: ClientBootIntentSource = 'pending'
let intentUnlockedAt: number | null = null
let activationGateInstalled = false
let activationQueue: BootTask[] = []

const getWindowRef = () => (typeof window === 'undefined' ? null : window)
const getDocumentRef = () => (typeof document === 'undefined' ? null : document)

type PrerenderingDocument = Document & {
  prerendering?: boolean
}

declare global {
  interface Window {
    __PROM_CLIENT_BOOT__?: ClientBootDebugState
  }
}

const syncClientBootDebugState = () => {
  const windowRef = getWindowRef()
  if (!windowRef) return
  windowRef.__PROM_CLIENT_BOOT__ = {
    ready: intentReady,
    source: intentSource,
    unlockedAt: intentUnlockedAt
  }
}

const flushIntentQueue = (source: Exclude<ClientBootIntentSource, 'pending'>) => {
  if (intentReady) return
  intentReady = true
  intentSource = source
  intentUnlockedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  syncClientBootDebugState()
  const pending = intentQueue
  intentQueue = []
  pending.forEach((task) => {
    if (!task.canceled) {
      task.run()
    }
  })
}

const scheduleIdle = (callback: () => void, timeoutMs = DEFAULT_IDLE_TIMEOUT_MS) => {
  const windowRef = getWindowRef()
  if (!windowRef) return () => {}

  const idleApi = windowRef as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }

  if (typeof idleApi.requestIdleCallback === 'function') {
    const handle = idleApi.requestIdleCallback(callback, { timeout: timeoutMs })
    return () => {
      idleApi.cancelIdleCallback?.(handle)
    }
  }

  const handle = windowRef.setTimeout(callback, Math.min(timeoutMs, 250))
  return () => windowRef.clearTimeout(handle)
}

const isPageActivationPending = () => {
  const documentRef = getDocumentRef() as PrerenderingDocument | null
  if (!documentRef) return false
  if (documentRef.prerendering === true) return true
  const visibilityState = documentRef.visibilityState as DocumentVisibilityState | 'prerender'
  return visibilityState === 'prerender'
}

const flushActivationQueue = () => {
  if (isPageActivationPending()) return
  const pending = activationQueue
  activationQueue = []
  pending.forEach((task) => {
    task.cancelDeferred = undefined
    if (!task.canceled) {
      task.run()
    }
  })
}

const installActivationGate = () => {
  const documentRef = getDocumentRef()
  if (!documentRef || activationGateInstalled) return
  activationGateInstalled = true

  const handleActivation = () => {
    if (isPageActivationPending()) return
    documentRef.removeEventListener('prerenderingchange', handleActivation)
    documentRef.removeEventListener('visibilitychange', handleActivation)
    activationGateInstalled = false
    flushActivationQueue()
  }

  documentRef.addEventListener('prerenderingchange', handleActivation)
  documentRef.addEventListener('visibilitychange', handleActivation)
}

const queueAfterPageActivation = (task: BootTask, callback: () => void) => {
  if (!isPageActivationPending()) {
    callback()
    return
  }

  task.cancelDeferred?.()
  const activationTask: BootTask = {
    canceled: false,
    run: callback
  }
  activationQueue.push(activationTask)
  installActivationGate()
  task.cancelDeferred = () => {
    activationTask.canceled = true
  }
}

const installIntentGate = (timeoutMs = DEFAULT_INTENT_TIMEOUT_MS) => {
  const windowRef = getWindowRef()
  if (!windowRef || intentGateInstalled) return
  intentGateInstalled = true
  let timeoutHandle: number | null = null
  syncClientBootDebugState()

  const passiveHandlers = new Map<(typeof PASSIVE_INTENT_EVENTS)[number], () => void>()
  const activeHandlers = new Map<(typeof ACTIVE_INTENT_EVENTS)[number], () => void>()

  const cleanup = () => {
    if (timeoutHandle !== null) {
      windowRef.clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
    passiveHandlers.forEach((handler, eventName) => {
      windowRef.removeEventListener(eventName, handler)
    })
    activeHandlers.forEach((handler, eventName) => {
      windowRef.removeEventListener(eventName, handler)
    })
    passiveHandlers.clear()
    activeHandlers.clear()
  }

  const handleIntent = (source: Exclude<ClientBootIntentSource, 'pending'>) => {
    cleanup()
    flushIntentQueue(source)
  }

  PASSIVE_INTENT_EVENTS.forEach((eventName) => {
    const handler = () => handleIntent(eventName)
    passiveHandlers.set(eventName, handler)
    windowRef.addEventListener(eventName, handler, { once: true, passive: true })
  })
  ACTIVE_INTENT_EVENTS.forEach((eventName) => {
    const handler = () => handleIntent(eventName)
    activeHandlers.set(eventName, handler)
    windowRef.addEventListener(eventName, handler, { once: true })
  })
  timeoutHandle = windowRef.setTimeout(() => handleIntent('timeout'), timeoutMs)
}

export const isClientBootIntentReady = () => intentReady

export const getClientBootDebugState = (): ClientBootDebugState => ({
  ready: intentReady,
  source: intentSource,
  unlockedAt: intentUnlockedAt
})

export const runAfterClientIntent = (callback: () => void, timeoutMs = DEFAULT_INTENT_TIMEOUT_MS) => {
  const windowRef = getWindowRef()
  if (!windowRef) return () => {}
  if (intentReady) {
    const immediateTask: BootTask = {
      canceled: false,
      run: callback
    }
    queueAfterPageActivation(immediateTask, callback)
    return () => {}
  }

  const task: BootTask = {
    canceled: false,
    run: () => {
      queueAfterPageActivation(task, callback)
    }
  }
  intentQueue.push(task)
  installIntentGate(timeoutMs)

  return () => {
    task.canceled = true
    task.cancelDeferred?.()
  }
}

export const runAfterClientIntentIdle = (
  callback: () => void,
  options?: { intentTimeoutMs?: number; idleTimeoutMs?: number }
) => {
  let cancelIdle = () => {}
  const cancelIntent = runAfterClientIntent(() => {
    cancelIdle = scheduleIdle(callback, options?.idleTimeoutMs)
  }, options?.intentTimeoutMs)

  return () => {
    cancelIntent()
    cancelIdle()
  }
}

export const __resetClientBootForTests = () => {
  intentReady = false
  intentGateInstalled = false
  intentQueue = []
  intentSource = 'pending'
  intentUnlockedAt = null
  activationGateInstalled = false
  activationQueue = []
  syncClientBootDebugState()
}

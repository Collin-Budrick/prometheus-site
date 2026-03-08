type BootTask = {
  canceled: boolean
  run: () => void
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

const getWindowRef = () => (typeof window === 'undefined' ? null : window)

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
    callback()
    return () => {}
  }

  const task: BootTask = {
    canceled: false,
    run: callback
  }
  intentQueue.push(task)
  installIntentGate(timeoutMs)

  return () => {
    task.canceled = true
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
  syncClientBootDebugState()
}

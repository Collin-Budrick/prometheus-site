import type { AiWorkerResponse } from './ai-inference.worker'
import workerUrl from './ai-inference.worker?worker&url'

let sharedWorker: Worker | null = null
let workerUsers = 0
let shutdownTimer: ReturnType<typeof setTimeout> | null = null
const workerIdleMs = 5_000
const workerShutdownGraceMs = 750

export const acquireAiWorker = (listener: (event: MessageEvent<AiWorkerResponse>) => void) => {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer)
    shutdownTimer = null
  }
  if (!sharedWorker) {
    sharedWorker = new Worker(workerUrl, { type: 'module' })
  }
  sharedWorker.addEventListener('message', listener)
  workerUsers += 1
  return sharedWorker
}

export const releaseAiWorker = (listener: (event: MessageEvent<AiWorkerResponse>) => void) => {
  if (!sharedWorker) return
  sharedWorker.removeEventListener('message', listener)
  workerUsers = Math.max(0, workerUsers - 1)
  if (workerUsers > 0 || shutdownTimer) return

  shutdownTimer = setTimeout(() => {
    if (!sharedWorker || workerUsers > 0) return
    const worker = sharedWorker
    try {
      worker.postMessage({ type: 'shutdown' })
    } catch {
      // Ignore shutdown errors; terminate as a fallback.
    }
    setTimeout(() => {
      worker.terminate()
      if (sharedWorker === worker) {
        sharedWorker = null
      }
      shutdownTimer = null
    }, workerShutdownGraceMs)
  }, workerIdleMs)
}

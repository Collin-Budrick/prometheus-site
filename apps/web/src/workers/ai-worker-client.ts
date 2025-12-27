import type { AiWorkerResponse } from './ai-inference.worker'
import workerUrl from './ai-inference.worker?worker&url'

let sharedWorker: Worker | null = null
let workerUsers = 0
const keepWorkerAlive = true

export const acquireAiWorker = (listener: (event: MessageEvent<AiWorkerResponse>) => void) => {
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
  if (!keepWorkerAlive && workerUsers === 0) {
    sharedWorker.terminate()
    sharedWorker = null
  }
}

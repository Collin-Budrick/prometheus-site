/// <reference lib="webworker" />

import type { FragmentPayload } from '../types'
import { decodeRuntimeFragmentPayload } from './decode-payload'

type DecodePoolRequest = {
  id: number
  fragmentId: string
  bytes: ArrayBuffer
}

type DecodePoolSuccess = {
  id: number
  ok: true
  payload: FragmentPayload
}

type DecodePoolFailure = {
  id: number
  ok: false
  error: string
}

type DecodePoolResponse = DecodePoolSuccess | DecodePoolFailure

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<DecodePoolRequest>) => {
  const { id, fragmentId, bytes } = event.data

  try {
    const response: DecodePoolResponse = {
      id,
      ok: true,
      payload: decodeRuntimeFragmentPayload(fragmentId, new Uint8Array(bytes))
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: DecodePoolResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Fragment decode failed'
    }
    workerScope.postMessage(response)
  }
}

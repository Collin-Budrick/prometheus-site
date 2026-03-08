import { decodeFragmentPayload } from './binary'

type DecodePayloadMessage = {
  id: number
  kind: 'decode-payload'
  fragmentId: string
  bytes: ArrayBuffer
}

type WorkerRequest = DecodePayloadMessage

type WorkerSuccess = {
  id: number
  ok: true
  payload: ReturnType<typeof decodeFragmentPayload> & { id: string }
}

type WorkerFailure = {
  id: number
  ok: false
  error: string
}

type WorkerResponse = WorkerSuccess | WorkerFailure

const respond = (message: WorkerResponse) => {
  postMessage(message)
}

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (!message || message.kind !== 'decode-payload') return

  try {
    const payload = decodeFragmentPayload(new Uint8Array(message.bytes))
    respond({
      id: message.id,
      ok: true,
      payload: { ...payload, id: message.fragmentId }
    })
  } catch (error) {
    respond({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Fragment decode failed'
    })
  }
})

import { afterEach, describe, expect, it } from 'bun:test'
import { gunzipSync, gzipSync } from 'node:zlib'

import { buildFragmentFrame, buildFragmentHeartbeatFrame } from './frames'
import { createFragmentClient } from './client'
import { decodeFragmentPayload, encodeFragmentPayloadFromTree } from './binary'
import type { FragmentDefinition, RenderNode } from './types'

const originalFetch = globalThis.fetch
type MutableGlobals = Omit<typeof globalThis, 'window' | 'Worker' | 'WebTransport' | 'DecompressionStream'> & {
  window?: Window & typeof globalThis
  Worker?: typeof Worker
  WebTransport?: unknown
  DecompressionStream?: typeof DecompressionStream
}

const mutableGlobals = globalThis as MutableGlobals
const originalWindow = mutableGlobals.window
const originalWorker = mutableGlobals.Worker
const originalWebTransport = mutableGlobals.WebTransport
const originalDecompressionStream = mutableGlobals.DecompressionStream

const tree: RenderNode = {
  type: 'element',
  tag: 'article',
  children: [{ type: 'text', text: 'worker decoded' }]
}

const definition: FragmentDefinition = {
  id: 'fragment://worker-decode',
  ttl: 10,
  staleTtl: 5,
  tags: ['test'],
  runtime: 'edge',
  head: [],
  css: '',
  render: () => tree
}

class MockWorker {
  static urls: unknown[] = []
  private messageListener: ((event: MessageEvent) => void) | null = null
  private errorListener: ((event: Event) => void) | null = null

  constructor(url?: unknown) {
    MockWorker.urls.push(url)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message' && typeof listener === 'function') {
      this.messageListener = listener as (event: MessageEvent) => void
      return
    }
    if (type === 'error' && typeof listener === 'function') {
      this.errorListener = listener as (event: Event) => void
    }
  }

  postMessage(message: { id: number; fragmentId: string; bytes: ArrayBuffer }) {
    try {
      const decoded = decodeFragmentPayload(new Uint8Array(message.bytes))
      this.messageListener?.({
        data: {
          id: message.id,
          ok: true,
          payload: { ...decoded, id: message.fragmentId }
        }
      } as MessageEvent)
    } catch (error) {
      this.messageListener?.({
        data: {
          id: message.id,
          ok: false,
          error: error instanceof Error ? error.message : 'decode failed'
        }
      } as MessageEvent)
      this.errorListener?.(new Event('error'))
    }
  }

  terminate() {}
}

class ResettingWebTransport {
  ready: Promise<unknown>
  closed: Promise<unknown>

  constructor() {
    this.ready = Promise.reject(new Error('ERR_CONNECTION_RESET'))
    this.closed = Promise.resolve()
  }

  close() {}
}

class MockGzipDecompressionStream {
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>

  constructor(format: string) {
    if (format !== 'gzip') {
      throw new Error(`Unsupported mock format: ${format}`)
    }

    const chunks: Uint8Array[] = []
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk) {
        chunks.push(chunk)
      },
      flush(controller) {
        const input = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
        controller.enqueue(new Uint8Array(gunzipSync(input)))
      }
    })

    this.readable = transform.readable
    this.writable = transform.writable
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  mutableGlobals.window = originalWindow
  mutableGlobals.Worker = originalWorker
  mutableGlobals.WebTransport = originalWebTransport
  mutableGlobals.DecompressionStream = originalDecompressionStream
  MockWorker.urls = []
})

describe('fragment client V2 decoding', () => {
  it('decodes protocol 2 batch payloads through the worker path', async () => {
    const bytes = encodeFragmentPayloadFromTree(definition, tree)
    const trustedWorkerUrl = { __trustedScriptUrl: true }
    let transformedWorkerUrl = ''

    mutableGlobals.window = {} as Window & typeof globalThis
    mutableGlobals.Worker = MockWorker as unknown as typeof Worker

    globalThis.fetch = (async () =>
      new Response(buildFragmentFrame(definition.id, bytes), {
        headers: { 'content-type': 'application/octet-stream' }
      })) as unknown as typeof fetch

    const client = createFragmentClient({
      getApiBase: () => 'http://api.test',
      getFragmentProtocol: () => 2,
      transformWorkerScriptUrl: (url) => {
        transformedWorkerUrl = url
        return trustedWorkerUrl
      }
    })

    const payloads = await client.fetchFragmentBatch([{ id: definition.id }])

    expect(transformedWorkerUrl).toContain('decode.worker.ts')
    expect(MockWorker.urls[0]).toBe(trustedWorkerUrl)
    expect(payloads[definition.id]?.id).toBe(definition.id)
    expect(payloads[definition.id]?.tree).toEqual(tree)
  })

  it('cools down webtransport after a failed handshake and falls back to fetch streaming', async () => {
    let webTransportAttempts = 0
    let fetchCalls = 0

    mutableGlobals.WebTransport = class extends ResettingWebTransport {
      constructor(url: string) {
        super()
        void url
        webTransportAttempts += 1
      }
    }

    globalThis.fetch = (async () => {
      fetchCalls += 1
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          }
        }),
        {
          headers: { 'content-type': 'application/octet-stream' }
        }
      )
    }) as unknown as typeof fetch

    const client = createFragmentClient({
      getApiBase: () => 'https://api.test',
      getWebTransportBase: () => 'https://transport-a.test',
      getFragmentProtocol: () => 2,
      isWebTransportPreferred: () => true
    })

    await client.streamFragments('/', () => {})
    await client.streamFragments('/', () => {})

    expect(webTransportAttempts).toBe(1)
    expect(fetchCalls).toBe(2)
  })

  it('ignores heartbeat frames in streamed protocol 2 payloads', async () => {
    const bytes = encodeFragmentPayloadFromTree(definition, tree)
    const seen: string[] = []

    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(buildFragmentHeartbeatFrame())
            controller.enqueue(buildFragmentFrame(definition.id, bytes))
            controller.close()
          }
        }),
        {
          headers: { 'content-type': 'application/octet-stream' }
        }
      )) as unknown as typeof fetch

    const client = createFragmentClient({
      getApiBase: () => 'http://api.test',
      getFragmentProtocol: () => 2
    })

    await client.streamFragments('/', (payload) => {
      seen.push(payload.id)
    })

    expect(seen).toEqual([definition.id])
  })

  it('passes explicit fragment ids to fetch streaming', async () => {
    let requestedUrl = ''

    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          }
        }),
        {
          headers: { 'content-type': 'application/octet-stream' }
        }
      )
    }) as unknown as typeof fetch

    const client = createFragmentClient({
      getApiBase: () => 'http://api.test',
      getFragmentProtocol: () => 2
    })

    await client.streamFragments('/', () => {}, undefined, {
      ids: ['fragment://visible/a', 'fragment://visible/b', 'fragment://visible/a']
    })

    expect(requestedUrl).toContain('/fragments/stream?')
    expect(requestedUrl).toContain(
      `ids=${encodeURIComponent('fragment://visible/a,fragment://visible/b')}`
    )
  })

  it('passes explicit fragment ids to webtransport streaming', async () => {
    let transportUrl = ''

    mutableGlobals.WebTransport = class extends ResettingWebTransport {
      constructor(url: string) {
        super()
        transportUrl = url
      }
    }

    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          }
        }),
        {
          headers: { 'content-type': 'application/octet-stream' }
        }
      )) as unknown as typeof fetch

    const client = createFragmentClient({
      getApiBase: () => 'https://api.test',
      getWebTransportBase: () => 'https://transport.test',
      getFragmentProtocol: () => 2,
      isWebTransportPreferred: () => true
    })

    await client.streamFragments('/', () => {}, undefined, {
      ids: ['fragment://visible/a', 'fragment://visible/b']
    })

    expect(transportUrl).toContain('/fragments/transport?')
    expect(transportUrl).toContain(
      `ids=${encodeURIComponent('fragment://visible/a,fragment://visible/b')}`
    )
  })

  it('decompresses gzip-compressed protocol 2 batch payloads when compression is preferred', async () => {
    let acceptEncoding = ''

    mutableGlobals.DecompressionStream = MockGzipDecompressionStream as unknown as typeof DecompressionStream
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      acceptEncoding = request.headers.get('x-fragment-accept-encoding') ?? ''
      return new Response(gzipSync(buildFragmentFrame(definition.id, encodeFragmentPayloadFromTree(definition, tree))), {
        headers: {
          'content-type': 'application/octet-stream',
          'x-fragment-content-encoding': 'gzip'
        }
      })
    }) as unknown as typeof fetch

    const client = createFragmentClient({
      getApiBase: () => 'http://api.test',
      getFragmentProtocol: () => 2,
      isFragmentCompressionPreferred: () => true
    })

    const payloads = await client.fetchFragmentBatch([{ id: definition.id }])

    expect(acceptEncoding).toContain('gzip')
    expect(payloads[definition.id]?.tree).toEqual(tree)
  })

  it('does not advertise streamed compression without native decompression support', async () => {
    let acceptEncoding = ''

    mutableGlobals.DecompressionStream = undefined
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      acceptEncoding = request.headers.get('x-fragment-accept-encoding') ?? ''
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          }
        }),
        {
          headers: { 'content-type': 'application/octet-stream' }
        }
      )
    }) as unknown as typeof fetch

    const client = createFragmentClient({
      getApiBase: () => 'http://api.test',
      getFragmentProtocol: () => 2,
      isFragmentCompressionPreferred: () => true
    })

    await client.streamFragments('/', () => {})

    expect(acceptEncoding).toBe('')
  })
})

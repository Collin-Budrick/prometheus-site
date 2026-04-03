import type { FragmentPayload, FragmentPlan, HeadOp } from './types'
import { decodeFragmentPayload } from './binary'
import {
  buildFragmentDecompressionReader,
  decompressFragmentBytesWithNativeStream,
  getFragmentResponseEncoding,
  getSupportedNativeFragmentDecompressionEncodings,
  type FragmentCompressionEncoding,
  type NativeFragmentCompressionEncoding
} from './compression'
import { isFragmentHeartbeatFrame, parseFragmentFrames } from './frames'
import { encodeFragmentKnownVersions, type FragmentKnownVersions } from './known-versions'
import { createFragmentPlanCache, type FragmentPlanCache } from './plan-cache'

type DecodeFragmentPayload = (fragmentId: string, bytes: Uint8Array) => Promise<FragmentPayload>

type DecodeWorkerRequest = {
  id: number
  kind: 'decode-payload'
  fragmentId: string
  bytes: ArrayBuffer
}

type DecodeWorkerSuccess = {
  id: number
  ok: true
  payload: FragmentPayload
}

type DecodeWorkerFailure = {
  id: number
  ok: false
  error: string
}

type DecodeWorkerResponse = DecodeWorkerSuccess | DecodeWorkerFailure

type DecodeWorkerState = {
  nextId: number
  pending: Map<number, { resolve: (payload: FragmentPayload) => void; reject: (error: Error) => void }>
  worker: Worker
}

type WorkerScriptUrlTransformer = (url: string) => unknown

let decodeWorkerState: DecodeWorkerState | null = null
let decoderPromise: Promise<DecodeFragmentPayload> | null = null

const canUseDecodeWorker = () =>
  typeof window !== 'undefined' && typeof Worker === 'function'

const getDecodeWorkerState = (
  transformWorkerScriptUrl?: WorkerScriptUrlTransformer
): DecodeWorkerState | null => {
  if (!canUseDecodeWorker()) return null
  if (decodeWorkerState) return decodeWorkerState

  try {
    const workerUrl = new URL('./decode.worker.ts', import.meta.url)
    const scriptUrl = transformWorkerScriptUrl?.(workerUrl.toString()) ?? workerUrl
    const worker = new Worker(scriptUrl as string, { type: 'module' })
    const state: DecodeWorkerState = {
      nextId: 1,
      pending: new Map(),
      worker
    }
    worker.addEventListener('message', (event: MessageEvent<DecodeWorkerResponse>) => {
      const message = event.data
      const pending = state.pending.get(message.id)
      if (!pending) return
      state.pending.delete(message.id)
      if (message.ok) {
        pending.resolve(message.payload)
        return
      }
      pending.reject(new Error(message.error))
    })
    worker.addEventListener('error', (event) => {
      const reason = event.error instanceof Error ? event.error : new Error('Fragment decode worker failed')
      state.pending.forEach(({ reject }) => reject(reason))
      state.pending.clear()
      worker.terminate()
      if (decodeWorkerState?.worker === worker) {
        decodeWorkerState = null
        decoderPromise = null
      }
    })
    decodeWorkerState = state
    return state
  } catch {
    return null
  }
}

const decodeFragmentDirectly = async (fragmentId: string, bytes: Uint8Array) => {
  const payload = decodeFragmentPayload(bytes)
  return { ...payload, id: fragmentId }
}

const loadDecoder = async (
  preferDecodeWorker = true,
  transformWorkerScriptUrl?: WorkerScriptUrlTransformer
): Promise<DecodeFragmentPayload> => {
  if (!preferDecodeWorker) {
    return decodeFragmentDirectly
  }

  if (decoderPromise) {
    return decoderPromise
  }

  const workerState = getDecodeWorkerState(transformWorkerScriptUrl)
  if (!workerState) {
    decoderPromise = Promise.resolve(decodeFragmentDirectly)
    return decoderPromise
  }

  decoderPromise = Promise.resolve(async (fragmentId: string, bytes: Uint8Array) =>
    await new Promise<FragmentPayload>((resolve, reject) => {
      const requestId = workerState.nextId
      workerState.nextId += 1
      workerState.pending.set(requestId, { resolve, reject })
      const buffer = bytes.slice().buffer
      const message: DecodeWorkerRequest = {
        id: requestId,
        kind: 'decode-payload',
        fragmentId,
        bytes: buffer
      }
      workerState.worker.postMessage(message, [buffer])
    }))
  return decoderPromise
}

type WebTransportConstructor = new (url: string, options?: Record<string, unknown>) => {
  ready: Promise<unknown>
  closed: Promise<unknown>
  close?: (info?: { closeCode?: number; reason?: string }) => void
  incomingBidirectionalStreams?: ReadableStream<{
    readable: ReadableStream<Uint8Array>
  }>
  datagrams?: {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    maxDatagramSize?: number
  }
}

type StreamMetrics = {
  startedAt: number
  firstFrameAt?: number
  frames: number
}

type FragmentNetworkDebugEntry = {
  at: number
  bytes: number
  id: string
  source: 'single' | 'batch' | 'fetch-stream' | 'webtransport-stream' | 'webtransport-datagram'
}

const WEBTRANSPORT_FAILURE_COOLDOWN_MS = 60_000

const appliedCss = new Map<string, HTMLStyleElement | HTMLLinkElement>()
const appliedHeadCounts = new Map<string, number>()
const appliedHeadElements = new Map<string, HTMLElement>()
const fragmentHeadKeys = new Map<string, Set<string>>()
const appliedFragmentVersions = new Map<string, string>()
const webTransportCooldownUntil = new Map<string, number>()

const recordFragmentNetworkDebug = (
  entry: Omit<FragmentNetworkDebugEntry, 'at'>
) => {
  if (typeof window === 'undefined') return
  const target = window as Window & {
    __PROM_FRAGMENT_NETWORK_DEBUG__?: FragmentNetworkDebugEntry[]
  }
  const log = target.__PROM_FRAGMENT_NETWORK_DEBUG__ ?? []
  log.push({
    at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    ...entry
  })
  target.__PROM_FRAGMENT_NETWORK_DEBUG__ = log
}

export type FragmentClientConfig = {
  getApiBase: () => string
  getCspNonce?: () => string | null
  transformWorkerScriptUrl?: WorkerScriptUrlTransformer
  getWebTransportBase?: () => string
  getFragmentProtocol?: () => 1 | 2
  isFragmentCompressionPreferred?: () => boolean
  isDecodeWorkerPreferred?: () => boolean
  isWebTransportPreferred?: () => boolean
  isWebTransportDatagramsPreferred?: () => boolean
}

const getFragmentHeadKeys = (id: string) => {
  let keys = fragmentHeadKeys.get(id)
  if (!keys) {
    keys = new Set<string>()
    fragmentHeadKeys.set(id, keys)
  }
  return keys
}

const buildFragmentVersion = (payload: FragmentPayload) => {
  const { cacheKey } = payload.meta
  if (payload.cacheUpdatedAt !== undefined) {
    return `${cacheKey}:${payload.cacheUpdatedAt}`
  }
  return cacheKey
}

const escapeFragmentId = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

const markFragmentReady = (id: string) => {
  if (typeof document === 'undefined') return
  const selector = `[data-fragment-id="${escapeFragmentId(id)}"]`
  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    element.dataset.fragmentReady = 'true'
  })
}

export type FragmentClient = ReturnType<typeof createFragmentClient>

export const createFragmentClient = (
  config: FragmentClientConfig,
  planCache: FragmentPlanCache = createFragmentPlanCache()
) => {
  const getApiBase = () => config.getApiBase()
  const getCspNonce = () => config.getCspNonce?.() ?? null
  const getWebTransportBase = () => config.getWebTransportBase?.() ?? ''
  const getFragmentProtocol = () => config.getFragmentProtocol?.() ?? 1
  const isFragmentCompressionPreferred = () => config.isFragmentCompressionPreferred?.() ?? false
  const isDecodeWorkerPreferred = () => config.isDecodeWorkerPreferred?.() ?? true
  const isWebTransportPreferred = () => config.isWebTransportPreferred?.() ?? false
  const isWebTransportDatagramsPreferred = () => config.isWebTransportDatagramsPreferred?.() ?? false

  const applyFragmentEffects = (payload: FragmentPayload) => {
    if (typeof document === 'undefined') return

    const version = buildFragmentVersion(payload)
    if (appliedFragmentVersions.get(payload.id) === version) {
      markFragmentReady(payload.id)
      return
    }

    teardownFragmentEffects([payload.id])
    appliedFragmentVersions.set(payload.id, version)

    if (payload.css && !appliedCss.has(payload.id)) {
      const existingStyle = document.querySelector<HTMLStyleElement>(`style[data-fragment-css~="${payload.id}"]`)
      const existingLink = document.querySelector<HTMLLinkElement>(`link[data-fragment-css~="${payload.id}"]`)
      const existing = existingStyle ?? existingLink
      if (existing) {
        appliedCss.set(payload.id, existing)
      } else {
        const style = document.createElement('style')
        style.dataset.fragmentCss = payload.id
        const nonce = getCspNonce()
        if (nonce) {
          style.nonce = nonce
        }
        style.textContent = payload.css
        document.head.appendChild(style)
        appliedCss.set(payload.id, style)
      }
    }

    payload.head.forEach((op) => {
      const key = JSON.stringify(op)
      const currentCount = appliedHeadCounts.get(key) ?? 0
      appliedHeadCounts.set(key, currentCount + 1)
      const keys = getFragmentHeadKeys(payload.id)
      keys.add(key)
      if (currentCount > 0) return
      const element = applyHeadOp(op)
      if (element) appliedHeadElements.set(key, element)
    })

    markFragmentReady(payload.id)
  }

  const applyHeadOp = (op: HeadOp) => {
    if (typeof document === 'undefined') return
    if (op.op === 'title') {
      document.title = op.value
      return null
    }
    if (op.op === 'meta') {
      const meta = document.createElement('meta')
      if (op.name) meta.setAttribute('name', op.name)
      if (op.property) meta.setAttribute('property', op.property)
      meta.setAttribute('content', op.content)
      document.head.appendChild(meta)
      return meta
    }
    if (op.op === 'link') {
      const link = document.createElement('link')
      link.setAttribute('rel', op.rel)
      link.setAttribute('href', op.href)
      document.head.appendChild(link)
      return link
    }
    return null
  }

  const teardownFragmentEffects = (fragmentIds: string[]) => {
    fragmentIds.forEach((id) => appliedFragmentVersions.delete(id))
    if (typeof document === 'undefined') return

    fragmentIds.forEach((id) => {
      const keys = fragmentHeadKeys.get(id)
      if (keys) {
        keys.forEach((key) => {
          const count = appliedHeadCounts.get(key)
          if (typeof count !== 'number') return
          const next = count - 1
          if (next <= 0) {
            appliedHeadCounts.delete(key)
            const element = appliedHeadElements.get(key)
            if (element?.parentNode) {
              element.parentNode.removeChild(element)
            }
            appliedHeadElements.delete(key)
          } else {
            appliedHeadCounts.set(key, next)
          }
        })
        fragmentHeadKeys.delete(id)
      }

      const cssElement = appliedCss.get(id)
      if (cssElement?.parentNode) {
        cssElement.parentNode.removeChild(cssElement)
      }
      appliedCss.delete(id)
    })
  }

  const getPlanCache = () => planCache

  const appendProtocol = (params: URLSearchParams) => {
    if (getFragmentProtocol() === 2) {
      params.set('protocol', '2')
    }
  }

  const appendKnownVersions = (
    params: URLSearchParams,
    knownVersions: FragmentKnownVersions | undefined
  ) => {
    if (getFragmentProtocol() !== 2 || !knownVersions) return
    const encoded = encodeFragmentKnownVersions(knownVersions)
    if (encoded) {
      params.set('known', encoded)
    }
  }

  const fetchFragmentPlan = async (path: string, lang?: string): Promise<FragmentPlan> => {
    const api = getApiBase()
    const params = new URLSearchParams({ path })
    appendProtocol(params)
    if (lang) {
      params.set('lang', lang)
    }
    const cached = planCache.get(path, lang)
    const response = await fetch(`${api}/fragments/plan?${params.toString()}`, {
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined
    })
    if (response.status === 304) {
      if (!cached) {
        throw new Error('Plan fetch returned 304 without cached payload')
      }
      return cached.plan
    }
    if (!response.ok) {
      throw new Error(`Plan fetch failed: ${response.status}`)
    }
    const plan = (await response.json()) as FragmentPlan
    const etag = response.headers.get('etag')
    if (etag) {
      planCache.set(path, lang, { etag, plan })
    }
    return plan
  }

  type FetchFragmentOptions = {
    refresh?: boolean
    lang?: string
    knownVersions?: FragmentKnownVersions
    signal?: AbortSignal
  }

  const parseCacheUpdatedAt = (headers: Headers) => {
    const raw = headers.get('x-fragment-cache-updated')
    if (!raw) return undefined
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const fetchFragment = async (id: string, options: FetchFragmentOptions = {}): Promise<FragmentPayload> => {
    const api = getApiBase()
    const params = new URLSearchParams({ id })
    appendProtocol(params)
    if (options.refresh) {
      params.set('refresh', '1')
    }
    if (options.lang) {
      params.set('lang', options.lang)
    }
    const acceptedEncodings =
      isFragmentCompressionPreferred() ? getSupportedNativeFragmentDecompressionEncodings() : []
    const response = await fetch(`${api}/fragments?${params.toString()}`, {
      cache: options.refresh ? 'no-store' : 'default',
      signal: options.signal,
      headers: acceptedEncodings.length
        ? { 'x-fragment-accept-encoding': acceptedEncodings.join(',') }
        : undefined
    })
    if (!response.ok) {
      throw new Error(`Fragment fetch failed: ${response.status}`)
    }
    const bytes = await decompressResponseBytes(
      new Uint8Array(await response.arrayBuffer()),
      getFragmentResponseEncoding(response.headers),
      acceptedEncodings
    )
    recordFragmentNetworkDebug({ id, bytes: bytes.byteLength, source: 'single' })
    const cacheUpdatedAt = parseCacheUpdatedAt(response.headers)
    const decodeFragmentPayload = await loadDecoder(
      isDecodeWorkerPreferred(),
      config.transformWorkerScriptUrl
    )
    const payload = await decodeFragmentPayload(id, bytes)
    return { ...payload, cacheUpdatedAt }
  }

  type FragmentBatchEntry = {
    id: string
    refresh?: boolean
  }

  type StreamFragmentsOptions = {
    signal?: AbortSignal
    lang?: string
    knownVersions?: FragmentKnownVersions
    ids?: string[]
  }

  const appendFragmentIds = (params: URLSearchParams, ids: string[] | undefined) => {
    if (!Array.isArray(ids) || ids.length === 0) return
    const normalized = Array.from(
      new Set(
        ids
          .map((id) => id.trim())
          .filter((id) => id !== '')
      )
    )
    if (!normalized.length) return
    params.set('ids', normalized.join(','))
  }

  const fetchFragmentBatch = async (
    entries: FragmentBatchEntry[],
    options: FetchFragmentOptions = {}
  ): Promise<Record<string, FragmentPayload>> => {
    if (!entries.length) return {}
    const api = getApiBase()
    const params = new URLSearchParams()
    appendProtocol(params)
    appendKnownVersions(params, options.knownVersions)
    const batchUrl = params.size ? `${api}/fragments/batch?${params.toString()}` : `${api}/fragments/batch`
    const acceptedEncodings =
      isFragmentCompressionPreferred() ? getSupportedNativeFragmentDecompressionEncodings() : []
    const response = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(acceptedEncodings.length
          ? { 'x-fragment-accept-encoding': acceptedEncodings.join(',') }
          : {})
      },
      body: JSON.stringify(
        entries.map((entry) => ({
          id: entry.id,
          lang: options.lang,
          refresh: entry.refresh === true ? true : undefined
        }))
      ),
      cache: entries.some((entry) => entry.refresh) || options.refresh ? 'no-store' : 'default',
      signal: options.signal
    })

    if (!response.ok) {
      throw new Error(`Fragment batch fetch failed: ${response.status}`)
    }

    const decodeFragmentPayload = await loadDecoder(
      isDecodeWorkerPreferred(),
      config.transformWorkerScriptUrl
    )
    const encodedBytes = new Uint8Array(await response.arrayBuffer())
    const responseBytes = await decompressResponseBytes(
      encodedBytes,
      getFragmentResponseEncoding(response.headers),
      acceptedEncodings
    )

    const entriesWithPayload =
      getFragmentProtocol() === 2
        ? await Promise.all(
            parseFragmentFrames(responseBytes)
              .filter((frame) => !isFragmentHeartbeatFrame(frame))
              .map(async (frame) => {
                recordFragmentNetworkDebug({
                  id: frame.id,
                  bytes: frame.payloadBytes.byteLength,
                  source: 'batch'
                })
                return [frame.id, await decodeFragmentPayload(frame.id, frame.payloadBytes)] as const
              })
          )
        : await Promise.all(
            Object.entries(
              JSON.parse(new TextDecoder().decode(responseBytes)) as Record<string, string>
            ).map(async ([id, base64]) => {
              const bytes =
                typeof Buffer !== 'undefined'
                  ? new Uint8Array(Buffer.from(base64, 'base64'))
                  : Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
              recordFragmentNetworkDebug({ id, bytes: bytes.byteLength, source: 'batch' })
              return [id, await decodeFragmentPayload(id, bytes)] as const
            })
          )

    return entriesWithPayload.reduce<Record<string, FragmentPayload>>((acc, [id, payload]) => {
      acc[id] = payload
      return acc
    }, {})
  }

  const getWebTransportCtor = () =>
    (globalThis as typeof globalThis & { WebTransport?: WebTransportConstructor }).WebTransport ?? null

  const toAbsoluteApiBase = (apiBase: string) => {
    if (!apiBase) return ''
    if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) return apiBase
    if (typeof window !== 'undefined' && window.location?.origin) {
      const path = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
      return `${window.location.origin}${path}`
    }
    return apiBase
  }

  const normalizeWebTransportBase = (apiBase: string) => toAbsoluteApiBase(apiBase).replace(/\/+$/, '')

  const isWebTransportCoolingDown = (apiBase: string) => {
    const key = normalizeWebTransportBase(apiBase)
    if (!key) return false
    const cooldownUntil = webTransportCooldownUntil.get(key)
    if (!cooldownUntil) return false
    if (Date.now() >= cooldownUntil) {
      webTransportCooldownUntil.delete(key)
      return false
    }
    return true
  }

  const markWebTransportCooldown = (apiBase: string) => {
    const key = normalizeWebTransportBase(apiBase)
    if (!key) return
    webTransportCooldownUntil.set(key, Date.now() + WEBTRANSPORT_FAILURE_COOLDOWN_MS)
  }

  const clearWebTransportCooldown = (apiBase: string) => {
    const key = normalizeWebTransportBase(apiBase)
    if (!key) return
    webTransportCooldownUntil.delete(key)
  }

  const idDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null

  class FragmentFrameBuffer {
    private buffer = new Uint8Array(0)
    private length = 0

    append(chunk: Uint8Array) {
      const required = this.length + chunk.byteLength
      if (required > this.buffer.byteLength) {
        let nextSize = Math.max(required, this.buffer.byteLength || 1024)
        while (nextSize < required) {
          nextSize *= 2
        }
        const next = new Uint8Array(nextSize)
        if (this.length) {
          next.set(this.buffer.subarray(0, this.length), 0)
        }
        this.buffer = next
      }
      this.buffer.set(chunk, this.length)
      this.length += chunk.byteLength
    }

    drainFrames() {
      const frames: Array<{ id: string; payloadBytes: Uint8Array }> = []
      let offset = 0

      while (this.length - offset >= 8) {
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + offset, 8)
        const idLength = view.getUint32(0, true)
        const payloadLength = view.getUint32(4, true)
        const frameSize = 8 + idLength + payloadLength
        if (this.length - offset < frameSize) {
          break
        }

        const idBytes = this.buffer.slice(offset + 8, offset + 8 + idLength)
        const payloadBytes = this.buffer.slice(offset + 8 + idLength, offset + frameSize)
        frames.push({
          id: (idDecoder ?? new TextDecoder()).decode(idBytes),
          payloadBytes
        })
        offset += frameSize
      }

      if (offset > 0) {
        this.buffer.copyWithin(0, offset, this.length)
        this.length -= offset
      }

      return frames
    }
  }

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    if (
      typeof error === 'number' ||
      typeof error === 'boolean' ||
      typeof error === 'bigint'
    )
      return String(error)
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string') return message
    }
    if (typeof error === 'object' && error !== null) {
      try {
        return JSON.stringify(error) ?? ''
      } catch {
        return ''
      }
    }
    return ''
  }

  const isWebTransportReset = (error: unknown) => {
    const message = getErrorMessage(error).toLowerCase()
    if (!message) return false
    return message.includes('reset_stream') || message.includes('reset stream')
  }

  const logStreamMetrics = (
    mode: 'fetch' | 'webtransport',
    metrics: StreamMetrics,
    status: 'ok' | 'aborted' | 'error'
  ) => {
    void mode
    void metrics
    void status
  }

  const readFragmentStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onFragment: (payload: FragmentPayload) => void,
    signal: AbortSignal | undefined,
    metrics: StreamMetrics,
    decodePayload: DecodeFragmentPayload,
    source: FragmentNetworkDebugEntry['source']
  ): Promise<'ok' | 'aborted'> => {
    const frameBuffer = new FragmentFrameBuffer()

    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel()
        } catch {
          // ignore cancellation errors
        }
        return 'aborted'
      }

      const chunk = await reader.read()

      const { value, done } = chunk
      if (done) {
        return 'ok'
      }
      if (value) {
        frameBuffer.append(value)
        for (const frame of frameBuffer.drainFrames()) {
          if (isFragmentHeartbeatFrame(frame)) {
            continue
          }
          if (!metrics.firstFrameAt && typeof performance !== 'undefined') {
            metrics.firstFrameAt = performance.now()
          }
          recordFragmentNetworkDebug({
            id: frame.id,
            bytes: frame.payloadBytes.byteLength,
            source
          })
          const payload = await decodePayload(frame.id, frame.payloadBytes)
          onFragment(payload)
          metrics.frames += 1
        }
      }
    }
  }

  const decompressResponseBytes = async (
    bytes: Uint8Array,
    encoding: FragmentCompressionEncoding | null,
    acceptedEncodings: NativeFragmentCompressionEncoding[]
  ) => {
    if (!encoding) return bytes
    if (encoding === 'zstd' || !acceptedEncodings.includes(encoding)) {
      throw new Error(`Fragment response encoding '${encoding}' is not supported by the client`)
    }
    const decoded = await decompressFragmentBytesWithNativeStream(bytes, encoding)
    if (decoded) return decoded
    throw new Error(`Fragment response ${encoding} decompression failed`)
  }

  const streamFragmentsWithFetch = async (
    path: string,
    onFragment: (payload: FragmentPayload) => void,
    onError?: (error: unknown) => void,
    options: StreamFragmentsOptions = {}
  ) => {
    const api = getApiBase()
    const preferCompression = isFragmentCompressionPreferred()
    const acceptedEncodings = preferCompression ? getSupportedNativeFragmentDecompressionEncodings() : []
    const headers: HeadersInit | undefined = acceptedEncodings.length
      ? { 'x-fragment-accept-encoding': acceptedEncodings.join(',') }
      : undefined
    const metrics: StreamMetrics = { startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(), frames: 0 }
    const params = new URLSearchParams({ path })
    appendProtocol(params)
    appendKnownVersions(params, options.knownVersions)
    appendFragmentIds(params, options.ids)
    if (options.lang) {
      params.set('lang', options.lang)
    }

    const response = await fetch(`${api}/fragments/stream?${params.toString()}`, {
      signal: options.signal,
      headers
    })
    if (!response.ok || !response.body) {
      logStreamMetrics('fetch', metrics, 'error')
      throw new Error(`Fragment stream failed: ${response.status}`)
    }

    const encoding = getFragmentResponseEncoding(response.headers)
    if (encoding && !acceptedEncodings.includes(encoding as NativeFragmentCompressionEncoding)) {
      logStreamMetrics('fetch', metrics, 'error')
      throw new Error(`Fragment stream encoding '${encoding}' is not supported for streaming`)
    }
    const canDecompress = Boolean(encoding && acceptedEncodings.includes(encoding as NativeFragmentCompressionEncoding))
    const reader = buildFragmentDecompressionReader(response.body, encoding, canDecompress)
    const decodePayload = await loadDecoder(
      isDecodeWorkerPreferred(),
      config.transformWorkerScriptUrl
    )

    try {
      const status = await readFragmentStream(
        reader,
        onFragment,
        options.signal,
        metrics,
        decodePayload,
        'fetch-stream'
      )
      logStreamMetrics('fetch', metrics, status)
    } catch (error) {
      if (options.signal?.aborted) {
        return
      }
      logStreamMetrics('fetch', metrics, 'error')
      onError?.(error)
      throw error
    }
  }

  const streamFragmentsWithWebTransport = async (
    path: string,
    onFragment: (payload: FragmentPayload) => void,
    options: StreamFragmentsOptions = {}
  ) => {
    const ctor = getWebTransportCtor()
    if (!ctor) return false

    const api = toAbsoluteApiBase(getWebTransportBase())
    if (!api) return false
    const metrics: StreamMetrics = { startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(), frames: 0 }
    const preferDatagrams = isWebTransportDatagramsPreferred()
    const supportsDatagrams = Boolean(
      (ctor as unknown as { prototype?: object })?.prototype && 'datagrams' in (ctor as unknown as { prototype: object }).prototype
    )
    const url = new URL(`${api}/fragments/transport`)
    url.searchParams.set('path', path)
    if (getFragmentProtocol() === 2) {
      url.searchParams.set('protocol', '2')
    }
    const knownVersions = options.knownVersions
      ? encodeFragmentKnownVersions(options.knownVersions)
      : ''
    if (knownVersions) {
      url.searchParams.set('known', knownVersions)
    }
    if (options.lang) {
      url.searchParams.set('lang', options.lang)
    }
    appendFragmentIds(url.searchParams, options.ids)
    if (preferDatagrams && supportsDatagrams) {
      url.searchParams.set('datagrams', '1')
    }
    const transport = new ctor(url.toString())

    try {
      await transport.ready
      const datagramReader =
        preferDatagrams && supportsDatagrams ? transport.datagrams?.readable?.getReader() ?? null : null
    const decodePayload = await loadDecoder(
      isDecodeWorkerPreferred(),
      config.transformWorkerScriptUrl
    )
      const datagramTask = datagramReader
        ? readFragmentStream(
            datagramReader,
            onFragment,
            options.signal,
            metrics,
            decodePayload,
            'webtransport-datagram'
          ).catch((error) => {
            if (!options.signal?.aborted) {
              console.warn('[fragment-stream][datagram] read failed', error)
            }
            return 'aborted'
          })
        : null
      const incoming = transport.incomingBidirectionalStreams?.getReader()
      if (!incoming) {
        throw new Error('WebTransport incoming bidirectional streams are unavailable')
      }
      const { value: bidi, done } = await incoming.read()
      if (done || !bidi) {
        throw new Error('WebTransport stream closed before fragments arrived')
      }
      const reader = bidi.readable.getReader()

      const status = await readFragmentStream(
        reader,
        onFragment,
        options.signal,
        metrics,
        decodePayload,
        'webtransport-stream'
      )
      if (datagramReader) {
        try {
          await datagramReader.cancel()
        } catch {
          // ignore cancellation errors
        }
        if (datagramTask) {
          await datagramTask
        }
      }
      logStreamMetrics('webtransport', metrics, status)
      return true
    } catch (error) {
      if (options.signal?.aborted) {
        logStreamMetrics('webtransport', metrics, 'aborted')
        return true
      }
      if (metrics.frames > 0) {
        logStreamMetrics('webtransport', metrics, 'ok')
        clearWebTransportCooldown(api)
        return true
      }
      markWebTransportCooldown(api)
      if (isWebTransportReset(error)) {
        logStreamMetrics('webtransport', metrics, 'error')
        return false
      }
      logStreamMetrics('webtransport', metrics, 'error')
      return false
    } finally {
      try {
        transport.close?.()
        await transport.closed
      } catch {
        // ignore close errors
      }
    }
  }

  const streamFragments = async (
    path: string,
    onFragment: (payload: FragmentPayload) => void,
    onError?: (error: unknown) => void,
    options: StreamFragmentsOptions = {}
  ) => {
    if (options.signal?.aborted) return

    const preferWebTransport =
      isWebTransportPreferred() && !isWebTransportCoolingDown(getWebTransportBase())
    if (preferWebTransport) {
      const success = await streamFragmentsWithWebTransport(path, onFragment, options)
      if (success) return
    }

    await streamFragmentsWithFetch(path, onFragment, onError, options)
  }

  return {
    applyFragmentEffects,
    teardownFragmentEffects,
    fetchFragmentPlan,
    fetchFragment,
    fetchFragmentBatch,
    streamFragments,
    getPlanCache
  }
}

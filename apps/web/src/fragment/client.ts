import type { FragmentPayload, FragmentPlan, HeadOp } from './types'
import {
  getApiBase,
  getWebTransportBase,
  isFragmentCompressionPreferred,
  isWebTransportDatagramsPreferred,
  isWebTransportPreferred
} from './config'

const concat = (a: Uint8Array, b: Uint8Array) => {
  const next = new Uint8Array(a.length + b.length)
  next.set(a, 0)
  next.set(b, a.length)
  return next
}

type DecodeFragmentPayload = (bytes: Uint8Array) => FragmentPayload

let decoderPromise: Promise<DecodeFragmentPayload> | null = null

const loadDecoder = async (): Promise<DecodeFragmentPayload> => {
  if (!decoderPromise) {
    decoderPromise = import('./binary')
      .then((mod) => mod.decodeFragmentPayload)
      .catch((error) => {
        decoderPromise = null
        throw error
      })
  }
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

const supportedEncodings = ['br', 'gzip', 'deflate'] as const
type CompressionEncoding = (typeof supportedEncodings)[number]

const appliedCss = new Map<string, HTMLStyleElement>()
const appliedHeadCounts = new Map<string, number>()
const appliedHeadElements = new Map<string, HTMLElement>()
const fragmentHeadKeys = new Map<string, Set<string>>()

const getFragmentHeadKeys = (id: string) => {
  let keys = fragmentHeadKeys.get(id)
  if (!keys) {
    keys = new Set<string>()
    fragmentHeadKeys.set(id, keys)
  }
  return keys
}

export const applyFragmentEffects = (payload: FragmentPayload) => {
  if (typeof document === 'undefined') return

  teardownFragmentEffects([payload.id])

  if (payload.css && !appliedCss.has(payload.id)) {
    const style = document.createElement('style')
    style.dataset.fragmentCss = payload.id
    style.textContent = payload.css
    document.head.appendChild(style)
    appliedCss.set(payload.id, style)
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

export const teardownFragmentEffects = (fragmentIds: string[]) => {
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

    const styleElement = appliedCss.get(id)
    if (styleElement?.parentNode) {
      styleElement.parentNode.removeChild(styleElement)
    }
    appliedCss.delete(id)
  })
}

export const fetchFragmentPlan = async (path: string, lang?: string): Promise<FragmentPlan> => {
  const api = getApiBase()
  const params = new URLSearchParams({ path })
  if (lang) {
    params.set('lang', lang)
  }
  const response = await fetch(`${api}/fragments/plan?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Plan fetch failed: ${response.status}`)
  }
  return response.json() as Promise<FragmentPlan>
}

type FetchFragmentOptions = {
  refresh?: boolean
  lang?: string
}

export const fetchFragment = async (id: string, options: FetchFragmentOptions = {}): Promise<FragmentPayload> => {
  const api = getApiBase()
  const params = new URLSearchParams({ id })
  if (options.refresh) {
    params.set('refresh', '1')
  }
  if (options.lang) {
    params.set('lang', options.lang)
  }
  const response = await fetch(`${api}/fragments?${params.toString()}`, {
    cache: options.refresh ? 'no-store' : 'default'
  })
  if (!response.ok) {
    throw new Error(`Fragment fetch failed: ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const decodeFragmentPayload = await loadDecoder()
  const payload = decodeFragmentPayload(bytes)
  return { ...payload, id }
}

const getWebTransportCtor = () =>
  (globalThis as typeof globalThis & { WebTransport?: WebTransportConstructor }).WebTransport ?? null

const getDecompressionStreamCtor = () =>
  (globalThis as typeof globalThis & {
    DecompressionStream?: new (format: CompressionEncoding) => TransformStream<Uint8Array, Uint8Array>
  }).DecompressionStream ?? null

let cachedDecompressionEncodings: CompressionEncoding[] | null = null

const getSupportedDecompressionEncodings = () => {
  if (cachedDecompressionEncodings) return cachedDecompressionEncodings
  const ctor = getDecompressionStreamCtor()
  if (!ctor) {
    cachedDecompressionEncodings = []
    return cachedDecompressionEncodings
  }
  const supported: CompressionEncoding[] = []
  for (const encoding of supportedEncodings) {
    try {
      new ctor(encoding)
      supported.push(encoding)
    } catch {
      // unsupported encoding
    }
  }
  cachedDecompressionEncodings = supported
  return supported
}

const toAbsoluteApiBase = (apiBase: string) => {
  if (!apiBase) return ''
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) return apiBase
  if (typeof window !== 'undefined' && window.location?.origin) {
    const path = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
    return `${window.location.origin}${path}`
  }
  return apiBase
}

const idDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null

const parseFrame = (bytes: Uint8Array) => {
  if (bytes.length < 8) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const idLength = view.getUint32(0, true)
  const payloadLength = view.getUint32(4, true)
  const frameSize = 8 + idLength + payloadLength
  if (bytes.length < frameSize) return null

  const idBytes = bytes.slice(8, 8 + idLength)
  const payloadBytes = bytes.slice(8 + idLength, frameSize)
  const id = (idDecoder ?? new TextDecoder()).decode(idBytes)

  return {
    id,
    payloadBytes,
    rest: bytes.slice(frameSize)
  }
}

const isWebTransportReset = (error: unknown) => {
  if (!error) return false
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('reset_stream') || message.includes('reset stream')
  }
  if (typeof error === 'string') {
    const message = error.toLowerCase()
    return message.includes('reset_stream') || message.includes('reset stream')
  }
  if (typeof error === 'object' && 'message' in error && typeof (error as { message?: string }).message === 'string') {
    const message = (error as { message: string }).message.toLowerCase()
    return message.includes('reset_stream') || message.includes('reset stream')
  }
  const fallback = String(error).toLowerCase()
  return fallback.includes('reset_stream') || fallback.includes('reset stream')
}

const logStreamMetrics = (mode: 'fetch' | 'webtransport', metrics: StreamMetrics, status: 'ok' | 'aborted' | 'error') => {
  if (typeof performance === 'undefined' || typeof console === 'undefined') return
  const total = Math.round(performance.now() - metrics.startedAt)
  const ttfb = metrics.firstFrameAt ? Math.round(metrics.firstFrameAt - metrics.startedAt) : null
  const summary: Record<string, number | string> = {
    mode,
    frames: metrics.frames,
    totalMs: total,
    status
  }
  if (ttfb !== null) summary.ttfbMs = ttfb
  console.info('[fragment-stream][metrics]', summary)
}

const readFragmentStream = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onFragment: (payload: FragmentPayload) => void,
  signal: AbortSignal | undefined,
  metrics: StreamMetrics,
  decodeFragmentPayload: DecodeFragmentPayload
): Promise<'ok' | 'aborted'> => {
  let buffer = new Uint8Array(0)

  while (true) {
    if (signal?.aborted) {
      try {
        await reader.cancel()
      } catch {
        // ignore cancellation errors
      }
      return 'aborted'
    }

    let chunk: Awaited<ReturnType<typeof reader.read>>

    try {
      chunk = await reader.read()
    } catch (error) {
      throw error
    }

    const { value, done } = chunk
    if (done) {
      return 'ok'
    }
    if (value) {
      buffer = concat(buffer, value)
      while (true) {
        const parsed = parseFrame(buffer)
        if (!parsed) break
        if (!metrics.firstFrameAt && typeof performance !== 'undefined') {
          metrics.firstFrameAt = performance.now()
        }
        const payload = decodeFragmentPayload(parsed.payloadBytes)
        onFragment({ ...payload, id: parsed.id })
        metrics.frames += 1
        buffer = parsed.rest ?? new Uint8Array(0)
      }
    }
  }
}

const getResponseEncoding = (headers: Headers): CompressionEncoding | null => {
  const raw =
    headers.get('x-fragment-content-encoding')?.trim().toLowerCase() ?? headers.get('content-encoding')?.trim().toLowerCase()
  if (!raw) return null
  return supportedEncodings.find((encoding) => raw.includes(encoding)) ?? null
}

const buildStreamReader = (
  stream: ReadableStream<Uint8Array>,
  encoding: CompressionEncoding | null,
  enableDecompression: boolean
) => {
  if (!encoding || !enableDecompression) {
    return stream.getReader()
  }
  const ctor = getDecompressionStreamCtor()
  if (!ctor) {
    return stream.getReader()
  }
  try {
    const transform = new ctor(encoding) as unknown as TransformStream<Uint8Array, Uint8Array>
    return stream.pipeThrough(transform).getReader()
  } catch {
    return stream.getReader()
  }
}

const streamFragmentsWithFetch = async (
  path: string,
  onFragment: (payload: FragmentPayload) => void,
  onError?: (error: unknown) => void,
  signal?: AbortSignal,
  lang?: string
) => {
  const api = getApiBase()
  const preferCompression = isFragmentCompressionPreferred()
  const acceptedEncodings = preferCompression ? getSupportedDecompressionEncodings() : []
  const headers: HeadersInit | undefined = acceptedEncodings.length
    ? { 'x-fragment-accept-encoding': acceptedEncodings.join(',') }
    : undefined
  const metrics: StreamMetrics = { startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(), frames: 0 }
  const params = new URLSearchParams({ path })
  if (lang) {
    params.set('lang', lang)
  }

  const response = await fetch(`${api}/fragments/stream?${params.toString()}`, { signal, headers })
  if (!response.ok || !response.body) {
    logStreamMetrics('fetch', metrics, 'error')
    throw new Error(`Fragment stream failed: ${response.status}`)
  }

  const encoding = getResponseEncoding(response.headers)
  const canDecompress = Boolean(encoding && acceptedEncodings.includes(encoding))
  const reader = buildStreamReader(response.body, encoding, canDecompress)
  const decodeFragmentPayload = await loadDecoder()

  try {
    const status = await readFragmentStream(reader, onFragment, signal, metrics, decodeFragmentPayload)
    logStreamMetrics('fetch', metrics, status)
  } catch (error) {
    if (signal?.aborted) {
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
  onError?: (error: unknown) => void,
  signal?: AbortSignal,
  lang?: string
) => {
  const ctor = getWebTransportCtor()
  if (!ctor) return false

  const api = toAbsoluteApiBase(getWebTransportBase())
  if (!api) return false
  const metrics: StreamMetrics = { startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(), frames: 0 }
  const preferDatagrams = isWebTransportDatagramsPreferred()
  const supportsDatagrams = Boolean(
    (ctor as unknown as { prototype?: object })?.prototype &&
      'datagrams' in (ctor as unknown as { prototype: object }).prototype
  )
  const url = new URL(`${api}/fragments/transport`)
  url.searchParams.set('path', path)
  if (lang) {
    url.searchParams.set('lang', lang)
  }
  if (preferDatagrams && supportsDatagrams) {
    url.searchParams.set('datagrams', '1')
  }
  const transport = new ctor(url.toString())

  try {
    await transport.ready
    const datagramReader =
      preferDatagrams && supportsDatagrams ? transport.datagrams?.readable?.getReader() ?? null : null
    const decodeFragmentPayload = await loadDecoder()
    const datagramTask = datagramReader
      ? readFragmentStream(datagramReader, onFragment, signal, metrics, decodeFragmentPayload).catch((error) => {
          if (!signal?.aborted) {
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

    const status = await readFragmentStream(reader, onFragment, signal, metrics, decodeFragmentPayload)
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
    if (signal?.aborted) {
      logStreamMetrics('webtransport', metrics, 'aborted')
      return true
    }
    if (metrics.frames > 0) {
      logStreamMetrics('webtransport', metrics, 'ok')
      return true
    }
    if (isWebTransportReset(error)) {
      logStreamMetrics('webtransport', metrics, 'error')
      onError?.(error)
      return false
    }
    logStreamMetrics('webtransport', metrics, 'error')
    onError?.(error)
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

export const streamFragments = async (
  path: string,
  onFragment: (payload: FragmentPayload) => void,
  onError?: (error: unknown) => void,
  signal?: AbortSignal,
  lang?: string
) => {
  if (signal?.aborted) return

  const preferWebTransport = isWebTransportPreferred()
  if (preferWebTransport) {
    const success = await streamFragmentsWithWebTransport(path, onFragment, onError, signal, lang)
    if (success) return
  }

  await streamFragmentsWithFetch(path, onFragment, onError, signal, lang)
}

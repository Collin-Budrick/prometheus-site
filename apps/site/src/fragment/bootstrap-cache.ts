import { decodeFragmentPayload } from '@core/fragment/binary'
import {
  decompressFragmentBytesWithNativeStream,
  getFragmentResponseEncoding,
  getSupportedNativeFragmentDecompressionEncodings,
  type NativeFragmentCompressionEncoding
} from '@core/fragment/compression'
import { isFragmentHeartbeatFrame, parseFragmentFrames } from '@core/fragment/frames'
import type { FragmentPayloadMap } from './types'
import { getPublicFragmentApiBase } from '../shared/public-fragment-config'

const FRAGMENT_BOOTSTRAP_STATE_KEY = '__PROM_FRAGMENT_BOOTSTRAP__'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type FragmentBootstrapWindowState = {
  byHref: Record<string, Promise<Uint8Array>>
}

export type FragmentBootstrapWindow = Window & {
  [FRAGMENT_BOOTSTRAP_STATE_KEY]?: FragmentBootstrapWindowState
}

const dedupeFragmentIds = (ids: readonly string[]) => {
  const unique: string[] = []
  const seen = new Set<string>()

  ids.forEach((id) => {
    const normalized = id.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    unique.push(normalized)
  })

  return unique
}

const buildBootstrapRequestHeaders = () => {
  const supportedEncodings = getSupportedNativeFragmentDecompressionEncodings()
  if (!supportedEncodings.length) {
    return undefined
  }
  return {
    'x-fragment-accept-encoding': supportedEncodings.join(',')
  }
}

const decompressBootstrapBytes = async (
  bytes: Uint8Array,
  encoding: ReturnType<typeof getFragmentResponseEncoding>,
  acceptedEncodings: NativeFragmentCompressionEncoding[]
) => {
  if (!encoding) return bytes
  if (encoding === 'zstd') {
    throw new Error("Fragment bootstrap encoding 'zstd' is not supported by the main-thread bootstrap cache")
  }
  if (!acceptedEncodings.includes(encoding)) {
    throw new Error(`Fragment bootstrap encoding '${encoding}' is not supported by the client`)
  }
  const decoded = await decompressFragmentBytesWithNativeStream(bytes, encoding)
  if (decoded) {
    return decoded
  }
  throw new Error(`Fragment bootstrap ${encoding} decompression failed`)
}

const resolveFragmentBootstrapUrl = (
  href: string,
  win: FragmentBootstrapWindow | null = typeof window !== 'undefined' ? (window as FragmentBootstrapWindow) : null
) => {
  const base = typeof win?.location?.origin === 'string' ? win.location.origin : 'https://prometheus.local'
  return new URL(href, base).toString()
}

const getBootstrapState = (
  win: FragmentBootstrapWindow | null = typeof window !== 'undefined' ? (window as FragmentBootstrapWindow) : null
) => {
  if (!win) return null
  const existing = win[FRAGMENT_BOOTSTRAP_STATE_KEY]
  if (existing) {
    return existing
  }
  const created: FragmentBootstrapWindowState = {
    byHref: {}
  }
  win[FRAGMENT_BOOTSTRAP_STATE_KEY] = created
  return created
}

export const buildFragmentBootstrapHref = ({
  ids,
  lang,
  apiBase = getPublicFragmentApiBase()
}: {
  ids: readonly string[]
  lang?: string
  apiBase?: string
}) => {
  const normalizedIds = dedupeFragmentIds(ids)
  const params = new URLSearchParams({
    protocol: '2',
    ids: normalizedIds.join(',')
  })
  if (lang) {
    params.set('lang', lang)
  }
  return `${apiBase}/fragments/bootstrap?${params.toString()}`
}

export const fetchFragmentBootstrapBytes = async ({
  href,
  fetcher = fetch as FetchLike,
  cache = 'default',
  signal
}: {
  href: string
  fetcher?: FetchLike
  cache?: RequestCache
  signal?: AbortSignal
}) => {
  const acceptedEncodings = getSupportedNativeFragmentDecompressionEncodings()
  const response = await fetcher(href, {
    cache,
    credentials: 'same-origin',
    mode: 'cors',
    signal,
    headers: buildBootstrapRequestHeaders()
  })
  if (!response.ok) {
    throw new Error(`Fragment bootstrap fetch failed: ${response.status}`)
  }
  const encoding = getFragmentResponseEncoding(response.headers)
  const encodedBytes = new Uint8Array(await response.arrayBuffer())
  return await decompressBootstrapBytes(encodedBytes, encoding, acceptedEncodings)
}

export const decodeFragmentBootstrapPayloads = (bytes: Uint8Array) =>
  parseFragmentFrames(bytes)
    .filter((frame) => !isFragmentHeartbeatFrame(frame))
    .reduce<FragmentPayloadMap>((acc, frame) => {
      acc[frame.id] = { ...decodeFragmentPayload(frame.payloadBytes), id: frame.id }
      return acc
    }, {})

export const primeFragmentBootstrapBytes = ({
  href,
  win = typeof window !== 'undefined' ? (window as FragmentBootstrapWindow) : null,
  fetcher = fetch as FetchLike,
  cache = 'default'
}: {
  href: string
  win?: FragmentBootstrapWindow | null
  fetcher?: FetchLike
  cache?: RequestCache
}) => {
  const state = getBootstrapState(win)
  const resolvedHref = resolveFragmentBootstrapUrl(href, win)
  const existing = state?.byHref[resolvedHref]
  if (existing) {
    return existing
  }

  const bytesPromise = fetchFragmentBootstrapBytes({
    href: resolvedHref,
    fetcher,
    cache
  }).catch((error) => {
    if (state?.byHref[resolvedHref]) {
      delete state.byHref[resolvedHref]
    }
    throw error
  })

  if (state) {
    state.byHref[resolvedHref] = bytesPromise
  }

  return bytesPromise
}

export const readPrimedFragmentBootstrapBytes = ({
  href,
  win = typeof window !== 'undefined' ? (window as FragmentBootstrapWindow) : null
}: {
  href: string
  win?: FragmentBootstrapWindow | null
}) => {
  const resolvedHref = resolveFragmentBootstrapUrl(href, win)
  return getBootstrapState(win)?.byHref[resolvedHref] ?? null
}

export const consumePrimedFragmentBootstrapBytes = ({
  href,
  win = typeof window !== 'undefined' ? (window as FragmentBootstrapWindow) : null
}: {
  href: string
  win?: FragmentBootstrapWindow | null
}) => {
  return readPrimedFragmentBootstrapBytes({ href, win })
}

export const clearPrimedFragmentBootstrapBytes = ({
  href,
  win = typeof window !== 'undefined' ? (window as FragmentBootstrapWindow) : null
}: {
  href?: string
  win?: FragmentBootstrapWindow | null
} = {}) => {
  const state = getBootstrapState(win)
  if (!state) return
  if (!href) {
    state.byHref = {}
    return
  }
  delete state.byHref[resolveFragmentBootstrapUrl(href, win)]
}

export const resetFragmentBootstrapStateForTests = (win?: FragmentBootstrapWindow | null) => {
  const target = win ?? (typeof window !== 'undefined' ? (window as FragmentBootstrapWindow) : null)
  if (!target) return
  delete target[FRAGMENT_BOOTSTRAP_STATE_KEY]
}

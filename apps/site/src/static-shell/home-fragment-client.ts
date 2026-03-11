import { decodeFragmentPayload } from '../../../../packages/core/src/fragment/binary'
import { isFragmentHeartbeatFrame, parseFragmentFrames } from '../../../../packages/core/src/fragment/frames'
import { encodeFragmentKnownVersions, type FragmentKnownVersions } from '../../../../packages/core/src/fragment/known-versions'
import type { FragmentPayload, HeadOp } from '../../../../packages/core/src/fragment/types'
import { getFragmentCssHref } from '../fragment/fragment-css'
import { getCspNonce } from '../security/client'
import { getPublicFragmentApiBase } from '../shared/public-fragment-config'
import { FragmentStreamError } from './fragment-stream-error'

type StreamHomeFragmentsOptions = {
  signal?: AbortSignal
  lang?: string
  knownVersions?: FragmentKnownVersions
  live?: boolean
}

type FetchHomeFragmentBatchOptions = {
  signal?: AbortSignal
  lang?: string
  knownVersions?: FragmentKnownVersions
  refresh?: boolean
}

const appliedCss = new Map<string, HTMLStyleElement | HTMLLinkElement>()
const appliedHeadCounts = new Map<string, number>()
const appliedHeadElements = new Map<string, HTMLElement>()
const fragmentHeadKeys = new Map<string, Set<string>>()
const appliedFragmentVersions = new Map<string, string>()
const idDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null

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

const applyHeadOp = (op: HeadOp) => {
  if (typeof document === 'undefined') return null
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

const ensureFragmentStylesheet = (id: string) => {
  if (typeof document === 'undefined') return
  const href = getFragmentCssHref(id)
  if (!href) return
  const existing = document.querySelector(`link[data-fragment-css~="${id}"]`)
  if (existing) return
  const byHref = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="preload"]')
  ).find((link) => link.getAttribute('href') === href)
  if (byHref) {
    const current = byHref.dataset.fragmentCss?.split(/\s+/).filter(Boolean) ?? []
    if (!current.includes(id)) {
      byHref.dataset.fragmentCss = [...current, id].join(' ')
    }
    return
  }
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.fragmentCss = id
  document.head.appendChild(link)
}

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

const decodeFragment = (fragmentId: string, bytes: Uint8Array): FragmentPayload => {
  const payload = decodeFragmentPayload(bytes)
  return { ...payload, id: fragmentId }
}

export const applyHomeFragmentEffects = (payload: FragmentPayload) => {
  const href = getFragmentCssHref(payload.id)
  if (href) {
    ensureFragmentStylesheet(payload.id)
    applyFragmentEffects({ ...payload, css: '' })
    return
  }
  applyFragmentEffects(payload)
}

export const fetchHomeFragmentBatch = async (
  ids: string[],
  options: FetchHomeFragmentBatchOptions = {}
) => {
  if (!ids.length) return {}

  const params = new URLSearchParams({ protocol: '2' })
  if (options.knownVersions) {
    const encoded = encodeFragmentKnownVersions(options.knownVersions)
    if (encoded) {
      params.set('known', encoded)
    }
  }

  const response = await fetch(`${getPublicFragmentApiBase()}/fragments/batch?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      ids.map((id) => ({
        id,
        lang: options.lang,
        refresh: options.refresh ? true : undefined
      }))
    ),
    cache: options.refresh ? 'no-store' : 'default',
    signal: options.signal
  })

  if (!response.ok) {
    throw new Error(`Home fragment batch fetch failed: ${response.status}`)
  }

  return parseFragmentFrames(new Uint8Array(await response.arrayBuffer()))
    .filter((frame) => !isFragmentHeartbeatFrame(frame))
    .reduce<Record<string, FragmentPayload>>((acc, frame) => {
      acc[frame.id] = decodeFragment(frame.id, frame.payloadBytes)
      return acc
    }, {})
}

export const streamHomeFragmentFrames = async (
  path: string,
  onFragment: (payload: FragmentPayload) => void,
  onError?: (error: unknown) => void,
  options: StreamHomeFragmentsOptions = {}
) => {
  const params = new URLSearchParams({ path, protocol: '2' })
  if (options.lang) {
    params.set('lang', options.lang)
  }
  if (options.knownVersions) {
    const encoded = encodeFragmentKnownVersions(options.knownVersions)
    if (encoded) {
      params.set('known', encoded)
    }
  }
  if (options.live === false) {
    params.set('live', '0')
  }

  const response = await fetch(`${getPublicFragmentApiBase()}/fragments/stream?${params.toString()}`, {
    signal: options.signal
  })

  if (!response.ok || !response.body) {
    throw new FragmentStreamError(`Fragment stream failed: ${response.status}`, {
      status: response.status,
      retryable: response.ok && !response.body ? false : undefined
    })
  }

  const reader = response.body.getReader()
  const frameBuffer = new FragmentFrameBuffer()

  try {
    while (true) {
      if (options.signal?.aborted) {
        try {
          await reader.cancel()
        } catch {
          // Ignore cancellation errors.
        }
        return
      }

      const { value, done } = await reader.read()
      if (done) {
        return
      }

      if (!value) continue
      frameBuffer.append(value)
      for (const frame of frameBuffer.drainFrames()) {
        if (isFragmentHeartbeatFrame(frame)) continue
        onFragment(decodeFragment(frame.id, frame.payloadBytes))
      }
    }
  } catch (error) {
    if (!options.signal?.aborted) {
      onError?.(error)
    }
    throw error
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Ignore reader cleanup failures.
    }
  }
}

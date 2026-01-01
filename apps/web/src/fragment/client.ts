import type { FragmentPayload, FragmentPlan, HeadOp } from './types'
import { decodeFragmentPayload } from './binary'

const DEFAULT_API_BASE = 'http://127.0.0.1:4000'

const getApiBase = () => {
  const env = import.meta.env as { VITE_API_BASE?: string }
  return env?.VITE_API_BASE?.trim() || DEFAULT_API_BASE
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const next = new Uint8Array(a.length + b.length)
  next.set(a, 0)
  next.set(b, a.length)
  return next
}

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

export const fetchFragmentPlan = async (path: string): Promise<FragmentPlan> => {
  const api = getApiBase()
  const response = await fetch(`${api}/fragments/plan?path=${encodeURIComponent(path)}`)
  if (!response.ok) {
    throw new Error(`Plan fetch failed: ${response.status}`)
  }
  return response.json() as Promise<FragmentPlan>
}

export const fetchFragment = async (id: string): Promise<FragmentPayload> => {
  const api = getApiBase()
  const response = await fetch(`${api}/fragments?id=${encodeURIComponent(id)}`)
  if (!response.ok) {
    throw new Error(`Fragment fetch failed: ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return decodeFragmentPayload(bytes)
}

export const streamFragments = async (
  path: string,
  onFragment: (payload: FragmentPayload) => void,
  onError?: (error: unknown) => void
) => {
  const api = getApiBase()
  const response = await fetch(`${api}/fragments/stream?path=${encodeURIComponent(path)}`)
  if (!response.ok || !response.body) {
    throw new Error(`Fragment stream failed: ${response.status}`)
  }

  const reader = response.body.getReader()
  let buffer = new Uint8Array(0)

  const readFrame = (bytes: Uint8Array) => {
    if (bytes.length < 8) return { done: false }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const idLength = view.getUint32(0, true)
    const payloadLength = view.getUint32(4, true)
    const frameSize = 8 + idLength + payloadLength
    if (bytes.length < frameSize) return { done: false }

    const idBytes = bytes.slice(8, 8 + idLength)
    const payloadBytes = bytes.slice(8 + idLength, frameSize)
    const id = new TextDecoder().decode(idBytes)
    const payload = decodeFragmentPayload(payloadBytes)
    onFragment({ ...payload, id })
    return { done: true, rest: bytes.slice(frameSize) }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      buffer = concat(buffer, value)
      while (true) {
        const parsed = readFrame(buffer)
        if (!parsed.done) break
        buffer = parsed.rest ?? new Uint8Array(0)
      }
    }
  }
}

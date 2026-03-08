import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPlan,
  FragmentPlanInitialPayloads,
  FragmentPlanResponse
} from './types'
import { decodeFragmentPayload } from './binary'
import { parseFragmentFrames } from './frames'
import { fragmentPlanCache } from './plan-cache'

type FragmentPlanOptions = {
  includeInitial?: boolean
  protocol?: 1 | 2
}

type FragmentFetchOptions = {
  protocol?: 1 | 2
}

type FragmentPlanResult = {
  plan: FragmentPlan
  initialFragments?: FragmentPayloadMap
}

const parseCacheUpdatedAt = (headers: Headers) => {
  const raw = headers.get('x-fragment-cache-updated')
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const resolveProtocol = (protocol?: 1 | 2) => (protocol === 2 ? 2 : 1)

const attachCacheUpdatedAt = (fragments: FragmentPayloadMap | undefined, plan: FragmentPlan) => {
  if (!fragments) return fragments
  const updatedAtById = new Map(plan.fragments.map((entry) => [entry.id, entry.cache?.updatedAt]))
  Object.entries(fragments).forEach(([id, payload]) => {
    const updatedAt = updatedAtById.get(id)
    if (typeof updatedAt === 'number') {
      payload.cacheUpdatedAt = updatedAt
    }
  })
  return fragments
}

const decodeInitialFragments = (raw: FragmentPlanInitialPayloads) => {
  const decoded: FragmentPayloadMap = {}
  Object.entries(raw).forEach(([id, payload]) => {
    try {
      const bytes = Buffer.from(payload, 'base64')
      const fragment = decodeFragmentPayload(bytes)
      decoded[id] = { ...fragment, id }
    } catch (error) {
      console.error('Initial fragment decode failed', { id, error })
    }
  })
  return decoded
}

const decodeFragmentFramePayloads = (bytes: Uint8Array) =>
  parseFragmentFrames(bytes).reduce<FragmentPayloadMap>((acc, frame) => {
    try {
      const payload = decodeFragmentPayload(frame.payloadBytes)
      acc[frame.id] = { ...payload, id: frame.id }
    } catch (error) {
      console.error('Bootstrap fragment decode failed', { id: frame.id, error })
    }
    return acc
  }, {})

export const loadFragmentBootstrap = async (
  path: string,
  config: { apiBase: string },
  lang?: string,
  options?: FragmentFetchOptions
) => {
  const protocol = resolveProtocol(options?.protocol)
  const params = new URLSearchParams({ path })
  if (lang) {
    params.set('lang', lang)
  }
  if (protocol === 2) {
    params.set('protocol', '2')
  }
  const response = await fetch(`${config.apiBase}/fragments/bootstrap?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Fragment bootstrap failed: ${response.status}`)
  }
  return decodeFragmentFramePayloads(new Uint8Array(await response.arrayBuffer()))
}

export const loadFragmentPlan = async (
  path: string,
  config: { apiBase: string },
  lang?: string,
  options?: FragmentPlanOptions
): Promise<FragmentPlanResult> => {
  const api = config.apiBase
  const includeInitial = options?.includeInitial !== false
  const protocol = resolveProtocol(options?.protocol)
  const cached = fragmentPlanCache.get(path, lang)
  const params = new URLSearchParams({ path })
  if (protocol === 2) {
    params.set('protocol', '2')
  }
  if (includeInitial && !cached?.initialFragments) {
    params.set('includeInitial', '1')
  }
  if (lang) {
    params.set('lang', lang)
  }
  const response = await fetch(`${api}/fragments/plan?${params.toString()}`, {
    headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined
  })
  if (response.status === 304) {
    if (!cached) {
      throw new Error('Plan fetch returned 304 without cached payload')
    }
    return { plan: cached.plan, initialFragments: includeInitial ? cached.initialFragments : undefined }
  }
  if (!response.ok) {
    throw new Error(`Plan fetch failed: ${response.status}`)
  }
  const payload = (await response.json()) as FragmentPlanResponse
  const hasInitialFragments = Object.prototype.hasOwnProperty.call(payload, 'initialFragments')
  const { initialFragments, ...plan } = payload
  const etag = response.headers.get('etag')
  const canReuseCachedInitial =
    Boolean(cached?.initialFragments) && Boolean(etag) && cached?.etag === etag
  const normalizedPlan = plan as FragmentPlan
  const decoded =
    includeInitial && protocol === 2
      ? canReuseCachedInitial
        ? cached?.initialFragments
        : await loadFragmentBootstrap(path, config, lang, { protocol })
      : includeInitial && hasInitialFragments
        ? decodeInitialFragments(initialFragments ?? {})
        : includeInitial && canReuseCachedInitial
          ? cached?.initialFragments
          : undefined
  const result: FragmentPlanResult = {
    plan: normalizedPlan,
    initialFragments: attachCacheUpdatedAt(decoded, normalizedPlan)
  }
  if (etag) {
    fragmentPlanCache.set(path, lang, {
      etag,
      plan: result.plan,
      initialFragments: includeInitial ? decoded : undefined
    })
  }
  return result
}

export const loadFragments = async (
  ids: string[],
  config: { apiBase: string },
  lang?: string,
  options?: FragmentFetchOptions
): Promise<Record<string, FragmentPayload>> => {
  const protocol = resolveProtocol(options?.protocol)
  const api = config.apiBase
  if (!ids.length) return {}
  if (protocol === 2 && ids.length > 1) {
    const params = new URLSearchParams({ protocol: '2' })
    const response = await fetch(`${api}/fragments/batch?${params.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        ids.map((id) => ({
          id,
          lang
        }))
      )
    })
    if (!response.ok) {
      throw new Error(`Fragment batch fetch failed: ${response.status}`)
    }
    return decodeFragmentFramePayloads(new Uint8Array(await response.arrayBuffer()))
  }

  const entries = await Promise.all(
    ids.map(async (id) => {
      const params = new URLSearchParams({ id })
      if (protocol === 2) {
        params.set('protocol', '2')
      }
      if (lang) {
        params.set('lang', lang)
      }
      const response = await fetch(`${api}/fragments?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Fragment fetch failed: ${response.status}`)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      const cacheUpdatedAt = parseCacheUpdatedAt(response.headers)
      const payload = decodeFragmentPayload(bytes)
      return [id, { ...payload, id, cacheUpdatedAt }] as const
    })
  )

  return entries.reduce<Record<string, FragmentPayload>>((acc, [id, payload]) => {
    acc[id] = payload
    return acc
  }, {})
}

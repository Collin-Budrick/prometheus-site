import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPlan,
  FragmentPlanInitialPayloads,
  FragmentPlanResponse
} from './types'
import { decodeFragmentPayload } from './binary'
import { getApiBase } from './config'
import { getCachedPlan, setCachedPlan } from './plan-cache'

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

export const loadFragmentPlan = async (
  path: string,
  env: Record<string, string | undefined>,
  lang?: string
): Promise<FragmentPlanResult> => {
  const api = getApiBase(env)
  const cached = getCachedPlan(path, lang)
  const params = new URLSearchParams({ path })
  if (!cached?.initialFragments) {
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
    return { plan: cached.plan, initialFragments: cached.initialFragments }
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
  const decoded = hasInitialFragments
    ? decodeInitialFragments(initialFragments ?? {})
    : canReuseCachedInitial
      ? cached?.initialFragments
      : undefined
  const normalizedPlan = plan as FragmentPlan
  const result: FragmentPlanResult = {
    plan: normalizedPlan,
    initialFragments: attachCacheUpdatedAt(decoded, normalizedPlan)
  }
  if (etag) {
    setCachedPlan(path, lang, { etag, plan: result.plan, initialFragments: decoded })
  }
  return result
}

export const loadFragments = async (
  ids: string[],
  env: Record<string, string | undefined>,
  lang?: string
): Promise<Record<string, FragmentPayload>> => {
  const api = getApiBase(env)
  const entries = await Promise.all(
    ids.map(async (id) => {
      const params = new URLSearchParams({ id })
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

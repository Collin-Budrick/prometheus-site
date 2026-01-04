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
  const params = new URLSearchParams({ path, includeInitial: '1' })
  if (lang) {
    params.set('lang', lang)
  }
  const cached = getCachedPlan(path, lang)
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
  const decoded = hasInitialFragments ? decodeInitialFragments(initialFragments ?? {}) : undefined
  const etag = response.headers.get('etag')
  const result: FragmentPlanResult = { plan: plan as FragmentPlan, initialFragments: decoded }
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
      const payload = decodeFragmentPayload(bytes)
      return [id, { ...payload, id }] as const
    })
  )

  return entries.reduce<Record<string, FragmentPayload>>((acc, [id, payload]) => {
    acc[id] = payload
    return acc
  }, {})
}

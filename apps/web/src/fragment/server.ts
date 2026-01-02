import type {
  FragmentPayload,
  FragmentPayloadMap,
  FragmentPlan,
  FragmentPlanInitialPayloads,
  FragmentPlanResponse
} from './types'
import { decodeFragmentPayload } from './binary'
import { getApiBase } from './config'

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
  env: Record<string, string | undefined>
): Promise<FragmentPlanResult> => {
  const api = getApiBase(env)
  const response = await fetch(`${api}/fragments/plan?path=${encodeURIComponent(path)}&includeInitial=1`)
  if (!response.ok) {
    throw new Error(`Plan fetch failed: ${response.status}`)
  }
  const payload = (await response.json()) as FragmentPlanResponse
  const hasInitialFragments = Object.prototype.hasOwnProperty.call(payload, 'initialFragments')
  const { initialFragments, ...plan } = payload
  const decoded = hasInitialFragments ? decodeInitialFragments(initialFragments ?? {}) : undefined
  return { plan: plan as FragmentPlan, initialFragments: decoded }
}

export const loadFragments = async (
  ids: string[],
  env: Record<string, string | undefined>
): Promise<Record<string, FragmentPayload>> => {
  const api = getApiBase(env)
  const entries = await Promise.all(
    ids.map(async (id) => {
      const response = await fetch(`${api}/fragments?id=${encodeURIComponent(id)}`)
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

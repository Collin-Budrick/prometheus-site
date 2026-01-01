import type { FragmentPayload, FragmentPlan } from './types'
import { decodeFragmentPayload } from './binary'
import { getApiBase } from './config'

export const loadFragmentPlan = async (path: string, env: Record<string, string | undefined>) => {
  const api = getApiBase(env)
  const response = await fetch(`${api}/fragments/plan?path=${encodeURIComponent(path)}`)
  if (!response.ok) {
    throw new Error(`Plan fetch failed: ${response.status}`)
  }
  return (await response.json()) as FragmentPlan
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

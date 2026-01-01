import type { FragmentPayload, FragmentPlan } from './types'
import { decodeFragmentPayload } from './binary'

const DEFAULT_API_BASE = 'http://127.0.0.1:4000'

const getApiBase = (env: Record<string, string | undefined>) => {
  const serverBase =
    typeof process !== 'undefined' && typeof process.env.API_BASE === 'string'
      ? process.env.API_BASE.trim()
      : ''
  return serverBase || env.VITE_API_BASE?.trim() || env.API_BASE?.trim() || DEFAULT_API_BASE
}

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
      const response = await fetch(`${api}/fragments/${encodeURIComponent(id)}`)
      if (!response.ok) {
        throw new Error(`Fragment fetch failed: ${response.status}`)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      const payload = decodeFragmentPayload(bytes)
      return [id, payload] as const
    })
  )

  return entries.reduce<Record<string, FragmentPayload>>((acc, [id, payload]) => {
    acc[id] = payload
    return acc
  }, {})
}

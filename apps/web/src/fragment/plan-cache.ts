import type { FragmentPayloadMap, FragmentPlan } from './types'

type FragmentPlanCacheEntry = {
  etag: string
  plan: FragmentPlan
  initialFragments?: FragmentPayloadMap
}

const buildPlanCacheKey = (path: string, lang?: string) => `${lang ?? 'default'}|${path}`

const planCache = new Map<string, FragmentPlanCacheEntry>()

export const getCachedPlan = (path: string, lang?: string) => planCache.get(buildPlanCacheKey(path, lang))

export const setCachedPlan = (path: string, lang: string | undefined, entry: FragmentPlanCacheEntry) => {
  const requestKey = buildPlanCacheKey(path, lang)
  planCache.set(requestKey, entry)
  const normalizedKey = buildPlanCacheKey(entry.plan.path, lang)
  if (normalizedKey !== requestKey) {
    planCache.set(normalizedKey, entry)
  }
}

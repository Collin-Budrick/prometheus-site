import type { FragmentPayloadMap, FragmentPlan } from './types'

type FragmentPlanCacheEntry = {
  etag: string
  plan: FragmentPlan
  initialFragments?: FragmentPayloadMap
}

const buildPlanCacheKey = (path: string, lang?: string) => `${lang ?? 'default'}|${path}`

const planCache = new Map<string, FragmentPlanCacheEntry>()
const PLAN_CACHE_LIMIT = 20

const touchEntry = (key: string, entry: FragmentPlanCacheEntry) => {
  planCache.delete(key)
  planCache.set(key, entry)
}

const evictLeastRecentlyUsed = () => {
  while (planCache.size > PLAN_CACHE_LIMIT) {
    const oldestKey = planCache.keys().next().value
    if (!oldestKey) break
    planCache.delete(oldestKey)
  }
}

export const getCachedPlan = (path: string, lang?: string) => {
  const key = buildPlanCacheKey(path, lang)
  const entry = planCache.get(key)
  if (!entry) return undefined
  touchEntry(key, entry)
  return entry
}

export const setCachedPlan = (path: string, lang: string | undefined, entry: FragmentPlanCacheEntry) => {
  const requestKey = buildPlanCacheKey(path, lang)
  touchEntry(requestKey, entry)
  const normalizedKey = buildPlanCacheKey(entry.plan.path, lang)
  if (normalizedKey !== requestKey) {
    touchEntry(normalizedKey, entry)
  }
  evictLeastRecentlyUsed()
}

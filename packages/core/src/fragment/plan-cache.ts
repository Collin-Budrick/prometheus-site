import type { FragmentPayloadMap, FragmentPlan } from './types'

export type FragmentPlanCacheEntry = {
  etag: string
  plan: FragmentPlan
  initialFragments?: FragmentPayloadMap
}

export type FragmentPlanCache = {
  get: (path: string, lang?: string) => FragmentPlanCacheEntry | undefined
  set: (path: string, lang: string | undefined, entry: FragmentPlanCacheEntry) => void
}

const buildPlanCacheKey = (path: string, lang?: string) => `${lang ?? 'default'}|${path}`

export const createFragmentPlanCache = (limit: number = 20): FragmentPlanCache => {
  const planCache = new Map<string, FragmentPlanCacheEntry>()

  const touchEntry = (key: string, entry: FragmentPlanCacheEntry) => {
    planCache.delete(key)
    planCache.set(key, entry)
  }

  const evictLeastRecentlyUsed = () => {
    while (planCache.size > limit) {
      const oldestKey = planCache.keys().next().value
      if (!oldestKey) break
      planCache.delete(oldestKey)
    }
  }

  return {
    get: (path, lang) => {
      const key = buildPlanCacheKey(path, lang)
      const entry = planCache.get(key)
      if (!entry) return undefined
      touchEntry(key, entry)
      return entry
    },
    set: (path, lang, entry) => {
      const requestKey = buildPlanCacheKey(path, lang)
      touchEntry(requestKey, entry)
      const normalizedKey = buildPlanCacheKey(entry.plan.path, lang)
      if (normalizedKey !== requestKey) {
        touchEntry(normalizedKey, entry)
      }
      evictLeastRecentlyUsed()
    }
  }
}

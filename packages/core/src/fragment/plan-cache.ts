import QuickLRU from 'quick-lru'
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
  const planCache = new QuickLRU<string, FragmentPlanCacheEntry>({ maxSize: limit })

  return {
    get: (path, lang) => {
      const key = buildPlanCacheKey(path, lang)
      return planCache.get(key)
    },
    set: (path, lang, entry) => {
      const requestKey = buildPlanCacheKey(path, lang)
      planCache.set(requestKey, entry)
      const normalizedKey = buildPlanCacheKey(entry.plan.path, lang)
      if (normalizedKey !== requestKey) {
        planCache.set(normalizedKey, entry)
      }
    }
  }
}

export const fragmentPlanCache = createFragmentPlanCache()

import { normalizePlanPath } from '@core/fragment/planner'
import type { FragmentLang } from '@core/fragment/i18n'
import type { CacheClient } from './cache'

const fragmentPlanCachePrefix = 'fragments:plan:'
const latencyHashKey = 'latency:stats'
const earlyLimitPrefix = 'early:limit:'

export const buildFragmentPlanCacheKey = (path: string, lang: FragmentLang) => `${fragmentPlanCachePrefix}${lang}:${path}`

export const buildCacheControlHeader = (ttl: number, staleTtl: number) =>
  `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${staleTtl}`

type PlanEtagVersion = {
  global: number
  entry: number
}

const planEtagVersions = new Map<string, number>()
let globalPlanEtagVersion = 0

const buildPlanEtagKey = (path: string, lang: FragmentLang) => `${lang}:${normalizePlanPath(path)}`

const bumpPlanEtagKey = (key: string) => {
  const next = (planEtagVersions.get(key) ?? 0) + 1
  planEtagVersions.set(key, next)
}

export const getPlanEtagVersion = (path: string, lang: FragmentLang): PlanEtagVersion => {
  const key = buildPlanEtagKey(path, lang)
  if (!planEtagVersions.has(key)) {
    planEtagVersions.set(key, 0)
  }
  return {
    global: globalPlanEtagVersion,
    entry: planEtagVersions.get(key) ?? 0
  }
}

export const bumpPlanEtagVersion = (path?: string, lang?: FragmentLang) => {
  if (path === undefined && lang === undefined) {
    globalPlanEtagVersion += 1
    planEtagVersions.clear()
    return
  }
  if (path !== undefined && lang !== undefined) {
    bumpPlanEtagKey(buildPlanEtagKey(path, lang))
    return
  }
  if (path !== undefined) {
    const normalizedPath = normalizePlanPath(path)
    for (const key of planEtagVersions.keys()) {
      if (key.endsWith(`:${normalizedPath}`)) {
        bumpPlanEtagKey(key)
      }
    }
    return
  }
  if (lang !== undefined) {
    const prefix = `${lang}:`
    for (const key of planEtagVersions.keys()) {
      if (key.startsWith(prefix)) {
        bumpPlanEtagKey(key)
      }
    }
  }
}

const safeJsonParse = (raw: string | null): unknown => {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const readCache = async (cache: CacheClient, key: string): Promise<unknown> => {
  if (!cache.isReady()) return null
  try {
    const cached = await cache.client.get(key)
    return safeJsonParse(cached)
  } catch {
    return null
  }
}

export const writeCache = async (cache: CacheClient, key: string, value: unknown, ttlSeconds: number) => {
  if (!cache.isReady()) return
  try {
    await cache.client.set(key, JSON.stringify(value), { EX: ttlSeconds })
  } catch (error) {
    console.warn('Failed to write cache entry', { key, error })
  }
}

export const invalidatePlanCache = async (cache: CacheClient, path?: string, lang?: FragmentLang) => {
  bumpPlanEtagVersion(path, lang)
  if (!cache.isReady()) return
  try {
    const hasPath = path !== undefined && path !== ''
    const hasLang = lang !== undefined
    if (hasPath && hasLang) {
      await cache.client.del(buildFragmentPlanCacheKey(path, lang))
      return
    }
    if (hasPath) {
      const keys = await cache.client.keys(`${fragmentPlanCachePrefix}*:${path}`)
      if (keys.length > 0) await cache.client.del(keys)
      return
    }
    const keys = await cache.client.keys(`${fragmentPlanCachePrefix}*`)
    if (keys.length > 0) await cache.client.del(keys)
  } catch (error) {
    console.warn('Failed to invalidate fragment plan cache', error)
  }
}

export const recordLatencySample = async (cache: CacheClient, metric: string, durationMs: number) => {
  if (!cache.isReady()) return
  const bucketKey = `${latencyHashKey}:${metric}`
  const rounded = Math.max(0, Math.round(durationMs))
  try {
    await cache.client.hIncrBy(bucketKey, 'count', 1)
    await cache.client.hIncrBy(bucketKey, 'totalMs', rounded)
  } catch (error) {
    console.warn('Failed to record latency sample', { metric, error })
  }
}

export const checkEarlyLimit = async (cache: CacheClient, key: string, max: number, windowMs: number) => {
  if (!cache.isReady()) return { allowed: true, remaining: max }
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000))
  const cacheKey = `${earlyLimitPrefix}${key}`
  try {
    const count = await cache.client.incr(cacheKey)
    if (count === 1) {
      await cache.client.expire(cacheKey, windowSeconds)
    }
    return { allowed: count <= max, remaining: Math.max(0, max - count) }
  } catch (error) {
    console.warn('Failed to check early limit', { key, error })
    return { allowed: true, remaining: max }
  }
}

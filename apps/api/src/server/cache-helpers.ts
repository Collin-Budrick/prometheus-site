import { isValkeyReady, valkey } from '../services/cache'
import { normalizePlanPath } from '@core/fragments'
import type { FragmentLang } from '../fragments/i18n'

export const storeItemsCachePrefix = 'store:items:'
const fragmentPlanCachePrefix = 'fragments:plan:'
const chatHistoryCacheKey = 'chat:history:latest'
const latencyHashKey = 'latency:stats'
const earlyLimitPrefix = 'early:limit:'

export const buildStoreItemsCacheKey = (cursor: number, limit: number) =>
  `${storeItemsCachePrefix}${cursor}:${limit}`

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

export const readCache = async (key: string): Promise<unknown> => {
  if (!isValkeyReady()) return null
  try {
    const cached = await valkey.get(key)
    return safeJsonParse(cached)
  } catch {
    return null
  }
}

export const writeCache = async (key: string, value: unknown, ttlSeconds: number) => {
  if (!isValkeyReady()) return
  try {
    await valkey.set(key, JSON.stringify(value), { EX: ttlSeconds })
  } catch (error) {
    console.warn('Failed to write cache entry', { key, error })
  }
}

export const invalidateStoreItemsCache = async () => {
  if (!isValkeyReady()) return

  try {
    const keys = await valkey.keys(`${storeItemsCachePrefix}*`)
    if (keys.length > 0) {
      await valkey.del(keys)
    }
  } catch (error) {
    console.warn('Failed to invalidate store cache keys', error)
  }
}

export const invalidatePlanCache = async (path?: string, lang?: FragmentLang) => {
  bumpPlanEtagVersion(path, lang)
  if (!isValkeyReady()) return
  try {
    const hasPath = path !== undefined && path !== ''
    const hasLang = lang !== undefined
    if (hasPath && hasLang) {
      await valkey.del(buildFragmentPlanCacheKey(path, lang))
      return
    }
    if (hasPath) {
      const keys = await valkey.keys(`${fragmentPlanCachePrefix}*:${path}`)
      if (keys.length > 0) await valkey.del(keys)
      return
    }
    const keys = await valkey.keys(`${fragmentPlanCachePrefix}*`)
    if (keys.length > 0) await valkey.del(keys)
  } catch (error) {
    console.warn('Failed to invalidate fragment plan cache', error)
  }
}

export const readChatHistoryCache = async (): Promise<unknown[] | null> => {
  const cached = await readCache(chatHistoryCacheKey)
  return Array.isArray(cached) ? cached : null
}
export const writeChatHistoryCache = async (payload: unknown, ttlSeconds: number) =>
  writeCache(chatHistoryCacheKey, payload, ttlSeconds)
export const invalidateChatHistoryCache = async () => {
  if (!isValkeyReady()) return
  try {
    await valkey.del(chatHistoryCacheKey)
  } catch (error) {
    console.warn('Failed to invalidate chat history cache', error)
  }
}

export const recordLatencySample = async (metric: string, durationMs: number) => {
  if (!isValkeyReady()) return
  const bucketKey = `${latencyHashKey}:${metric}`
  const rounded = Math.max(0, Math.round(durationMs))
  try {
    await valkey.hIncrBy(bucketKey, 'count', 1)
    await valkey.hIncrBy(bucketKey, 'totalMs', rounded)
  } catch (error) {
    console.warn('Failed to record latency sample', { metric, error })
  }
}

export const checkEarlyLimit = async (key: string, max: number, windowMs: number) => {
  if (!isValkeyReady()) return { allowed: true, remaining: max }
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000))
  const cacheKey = `${earlyLimitPrefix}${key}`
  try {
    const count = await valkey.incr(cacheKey)
    if (count === 1) {
      await valkey.expire(cacheKey, windowSeconds)
    }
    return { allowed: count <= max, remaining: Math.max(0, max - count) }
  } catch (error) {
    console.warn('Failed to check early limit', { key, error })
    return { allowed: true, remaining: max }
  }
}

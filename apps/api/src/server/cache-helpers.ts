import { isValkeyReady, valkey } from '../services/cache'

export const storeItemsCachePrefix = 'store:items:'
const fragmentPlanCachePrefix = 'fragments:plan:'
const chatHistoryCacheKey = 'chat:history:latest'
const latencyHashKey = 'latency:stats'
const earlyLimitPrefix = 'early:limit:'

export const buildStoreItemsCacheKey = (cursor: number, limit: number) =>
  `${storeItemsCachePrefix}${cursor}:${limit}`

export const buildFragmentPlanCacheKey = (path: string) => `${fragmentPlanCachePrefix}${path}`

export const buildCacheControlHeader = (ttl: number, staleTtl: number) =>
  `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${staleTtl}`

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const readCache = async <T>(key: string): Promise<T | null> => {
  if (!isValkeyReady()) return null
  try {
    const cached = await valkey.get(key)
    return safeJsonParse<T>(cached)
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

export const invalidatePlanCache = async (path?: string) => {
  if (!isValkeyReady()) return
  try {
    if (path) {
      await valkey.del(buildFragmentPlanCacheKey(path))
      return
    }
    const keys = await valkey.keys(`${fragmentPlanCachePrefix}*`)
    if (keys.length > 0) await valkey.del(keys)
  } catch (error) {
    console.warn('Failed to invalidate fragment plan cache', error)
  }
}

export const readChatHistoryCache = async <T>(): Promise<T | null> => readCache<T>(chatHistoryCacheKey)
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

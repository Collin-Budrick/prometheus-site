import { normalizePlanPath } from '@core/fragment/planner'
import type { FragmentLang } from '@core/fragment/i18n'
import type { ValkeyClientType } from '@valkey/client'
import type { CacheClient } from './cache'

const fragmentPlanCachePrefix = 'fragments:plan:'
const fragmentInitialCachePrefix = 'fragments:initial:'
const latencyHashKey = 'latency:stats'
const earlyLimitPrefix = 'early:limit:'
const cacheCommandTimeoutMs = 300

const withValkeyTimeout = async <T>(
  cache: CacheClient,
  runner: (commandOptions: ReturnType<ValkeyClientType['commandOptions']>) => Promise<T>,
  timeoutMs: number = cacheCommandTimeoutMs
) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await runner(cache.client.commandOptions({ signal: controller.signal }))
  } finally {
    clearTimeout(timer)
  }
}

export const buildFragmentPlanCacheKey = (path: string, lang: FragmentLang) => `${fragmentPlanCachePrefix}${lang}:${path}`
export const buildFragmentInitialCacheKey = (path: string, lang: FragmentLang, etag: string) =>
  `${fragmentInitialCachePrefix}${lang}:${normalizePlanPath(path)}:${etag}`

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
    const cached = await withValkeyTimeout(cache, (commandOptions) => cache.client.get(commandOptions, key))
    return safeJsonParse(cached)
  } catch {
    return null
  }
}

export const writeCache = async (cache: CacheClient, key: string, value: unknown, ttlSeconds: number) => {
  if (!cache.isReady()) return
  try {
    await withValkeyTimeout(cache, (commandOptions) =>
      cache.client.set(commandOptions, key, JSON.stringify(value), { EX: ttlSeconds })
    )
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
    const normalizedPath = hasPath ? normalizePlanPath(path) : undefined
    if (hasPath && hasLang) {
      const planKey = buildFragmentPlanCacheKey(normalizedPath ?? path, lang)
      const initialKeys = await cache.client.keys(`${fragmentInitialCachePrefix}${lang}:${normalizedPath}:*`)
      if (initialKeys.length > 0) {
        await cache.client.del(initialKeys)
      }
      await cache.client.del(planKey)
      return
    }
    if (hasPath) {
      const planKeys = await cache.client.keys(`${fragmentPlanCachePrefix}*:${normalizedPath}`)
      const initialKeys = await cache.client.keys(`${fragmentInitialCachePrefix}*:${normalizedPath}:*`)
      if (planKeys.length > 0) await cache.client.del(planKeys)
      if (initialKeys.length > 0) await cache.client.del(initialKeys)
      return
    }
    const planKeys = await cache.client.keys(`${fragmentPlanCachePrefix}*`)
    const initialKeys = await cache.client.keys(`${fragmentInitialCachePrefix}*`)
    if (planKeys.length > 0) await cache.client.del(planKeys)
    if (initialKeys.length > 0) await cache.client.del(initialKeys)
  } catch (error) {
    console.warn('Failed to invalidate fragment plan cache', error)
  }
}

export const recordLatencySample = async (cache: CacheClient, metric: string, durationMs: number) => {
  if (!cache.isReady()) return
  const bucketKey = `${latencyHashKey}:${metric}`
  const rounded = Math.max(0, Math.round(durationMs))
  try {
    await withValkeyTimeout(cache, (commandOptions) => cache.client.hIncrBy(commandOptions, bucketKey, 'count', 1))
    await withValkeyTimeout(cache, (commandOptions) =>
      cache.client.hIncrBy(commandOptions, bucketKey, 'totalMs', rounded)
    )
  } catch (error) {
    console.warn('Failed to record latency sample', { metric, error })
  }
}

export const checkEarlyLimit = async (cache: CacheClient, key: string, max: number, windowMs: number) => {
  if (!cache.isReady()) return { allowed: true, remaining: max }
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000))
  const cacheKey = `${earlyLimitPrefix}${key}`
  try {
    const count = await withValkeyTimeout(cache, (commandOptions) => cache.client.incr(commandOptions, cacheKey))
    if (count === 1) {
      await withValkeyTimeout(cache, (commandOptions) => cache.client.expire(commandOptions, cacheKey, windowSeconds))
    }
    return { allowed: count <= max, remaining: Math.max(0, max - count) }
  } catch (error) {
    console.warn('Failed to check early limit', { key, error })
    return { allowed: true, remaining: max }
  }
}

import type { ValkeyClientType } from '@valkey/client'
import { createLogger, type PlatformLogger } from './logger'

type Counter = { count: number; resetAt: number }

export type RateLimiter = {
  checkQuota: (key: string, maxRequests: number, windowMs: number, now?: number) => Promise<{
    allowed: boolean
    retryAfter: number
  }>
  setCleanupInterval: (intervalMs: number) => void
  clearInMemoryCounters: () => void
  getInMemoryCounterSize: () => number
}

type RateLimiterOptions = {
  cache?: ValkeyClientType
  logger?: PlatformLogger
  cleanupIntervalMs?: number
}

export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {
  const cache = options.cache
  const logger = options.logger ?? createLogger('rate-limit')

  const inMemoryCounters = new Map<string, Counter>()

  let cleanupIntervalMs = Math.max(1_000, options.cleanupIntervalMs ?? 60_000)
  let nextCounterCleanupAt = 0

  const setCleanupInterval = (intervalMs: number) => {
    cleanupIntervalMs = Math.max(1_000, intervalMs)
  }

  const cleanupExpiredCounters = (now: number) => {
    if (now < nextCounterCleanupAt) return
    for (const [key, counter] of inMemoryCounters) {
      if (now > counter.resetAt) {
        inMemoryCounters.delete(key)
      }
    }
    nextCounterCleanupAt = now + cleanupIntervalMs
  }

  const readMultiReply = (value: unknown) => (Array.isArray(value) ? value[1] : value)

  const getCounter = async (key: string, windowMs: number, now = Date.now()) => {
    cleanupExpiredCounters(now)

    if (cache?.isOpen) {
      try {
        const results = await cache.multi().incr(key).pTTL(key).exec()
        const countRaw = readMultiReply(results?.[0])
        const ttlRaw = readMultiReply(results?.[1])

        const count = Number(countRaw)
        let ttlMs = Number(ttlRaw)

        if (!Number.isFinite(count)) {
          throw new Error('Rate limiter returned invalid count')
        }

        if (Number.isNaN(ttlMs) || ttlMs < 0) {
          ttlMs = windowMs
          await cache.pExpire(key, windowMs)
        }

        return { count, resetAt: now + ttlMs }
      } catch (error) {
        logger.warn('Valkey rate limiter unavailable; using local fallback', { key, error })
      }
    }

    const counter = inMemoryCounters.get(key) || { count: 0, resetAt: now + windowMs }

    if (now > counter.resetAt) {
      counter.count = 0
      counter.resetAt = now + windowMs
    }

    counter.count += 1
    inMemoryCounters.set(key, counter)

    return counter
  }

  const checkQuota = async (key: string, maxRequests: number, windowMs: number, now = Date.now()) => {
    const counter = await getCounter(key, windowMs, now)

    const allowed = counter.count <= maxRequests
    const retryAfter = Math.max(0, Math.ceil((counter.resetAt - now) / 1000))

    return { allowed, retryAfter }
  }

  const clearInMemoryCounters = () => inMemoryCounters.clear()
  const getInMemoryCounterSize = () => inMemoryCounters.size

  return {
    checkQuota,
    setCleanupInterval,
    clearInMemoryCounters,
    getInMemoryCounterSize
  }
}

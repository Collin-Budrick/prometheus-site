import { Ratelimit, type RatelimitResponse } from '@unkey/ratelimit'
import { createLogger, type PlatformLogger } from './logger'

type Counter = { count: number; resetAt: number }

export type RateLimitResult = {
  allowed: boolean
  retryAfter: number
  limit: number
  remaining: number
  reset: number
  headers: Headers
}

export type RateLimiter = {
  checkQuota: (key: string, maxRequests: number, windowMs: number, now?: number) => Promise<RateLimitResult>
  setCleanupInterval: (intervalMs: number) => void
  clearInMemoryCounters: () => void
  getInMemoryCounterSize: () => number
}

type RateLimiterOptions = {
  unkey?: {
    rootKey?: string
    namespace?: string
    baseUrl?: string
  }
  logger?: PlatformLogger
  cleanupIntervalMs?: number
}

export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {
  const logger = options.logger ?? createLogger('rate-limit')
  const rootKey = options.unkey?.rootKey?.trim() ?? ''
  const namespace = options.unkey?.namespace?.trim() || 'prometheus-api'
  const baseUrl = options.unkey?.baseUrl?.trim() || undefined

  const inMemoryCounters = new Map<string, Counter>()

  let cleanupIntervalMs = Math.max(1_000, options.cleanupIntervalMs ?? 60_000)
  let nextCounterCleanupAt = 0

  const unkey = rootKey
    ? new Ratelimit({
        rootKey,
        namespace,
        baseUrl,
        limit: 1,
        duration: 1000
      })
    : null

  if (!rootKey) {
    logger.warn('UNKEY_ROOT_KEY is not set; using in-memory rate limiter fallback')
  }

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

  const getCounter = async (key: string, windowMs: number, now = Date.now()) => {
    cleanupExpiredCounters(now)

    const counter = inMemoryCounters.get(key) || { count: 0, resetAt: now + windowMs }

    if (now > counter.resetAt) {
      counter.count = 0
      counter.resetAt = now + windowMs
    }

    counter.count += 1
    inMemoryCounters.set(key, counter)

    return counter
  }

  const buildHeaders = (limit: number, remaining: number, reset: number, allowed: boolean, retryAfter: number) => {
    const headers = new Headers()
    headers.set('X-RateLimit-Limit', String(limit))
    headers.set('X-RateLimit-Remaining', String(Math.max(0, remaining)))
    headers.set('X-RateLimit-Reset', String(Math.ceil(reset / 1000)))
    if (!allowed) {
      headers.set('Retry-After', String(retryAfter))
    }
    return headers
  }

  const buildResult = (response: RatelimitResponse, now: number): RateLimitResult => {
    const allowed = response.success
    const limit = response.limit
    const remaining = response.remaining
    const reset = response.reset
    const retryAfter = allowed ? 0 : Math.max(0, Math.ceil((reset - now) / 1000))
    const headers = buildHeaders(limit, remaining, reset, allowed, retryAfter)

    return {
      allowed,
      retryAfter,
      limit,
      remaining,
      reset,
      headers
    }
  }

  const checkQuota = async (key: string, maxRequests: number, windowMs: number, now = Date.now()) => {
    if (unkey) {
      try {
        const response = await unkey.limit(key, {
          limit: {
            limit: maxRequests,
            duration: windowMs
          }
        })
        return buildResult(response, now)
      } catch (error) {
        logger.warn('Unkey rate limiter unavailable; using local fallback', { key, error })
      }
    }

    const counter = await getCounter(key, windowMs, now)

    const allowed = counter.count <= maxRequests
    const retryAfter = allowed ? 0 : Math.max(0, Math.ceil((counter.resetAt - now) / 1000))
    const remaining = Math.max(0, maxRequests - counter.count)
    const headers = buildHeaders(maxRequests, remaining, counter.resetAt, allowed, retryAfter)

    return {
      allowed,
      retryAfter,
      limit: maxRequests,
      remaining,
      reset: counter.resetAt,
      headers
    }
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

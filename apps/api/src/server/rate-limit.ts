import { isValkeyReady, valkey } from '../services/cache'

type Counter = { count: number; resetAt: number }

const inMemoryCounters = new Map<string, Counter>()

let cleanupIntervalMs = 60_000
let nextCounterCleanupAt = 0

export const setCleanupInterval = (intervalMs: number) => {
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

export const getCounter = async (key: string, windowMs: number, now = Date.now()) => {
  cleanupExpiredCounters(now)

  if (isValkeyReady()) {
    try {
      const results = (await valkey
        .multi()
        .incr(key)
        .pTTL(key)
        .exec()) as Array<[unknown, unknown]> | null
      const countRaw = results?.[0]?.[1]
      const ttlRaw = results?.[1]?.[1]

      const count = Number(countRaw)
      let ttlMs = Number(ttlRaw)

      if (Number.isNaN(ttlMs) || ttlMs < 0) {
        ttlMs = windowMs
        await valkey.pExpire(key, windowMs)
      }

      return { count, resetAt: now + ttlMs }
    } catch (error) {
      console.error('Valkey rate limiter unavailable; using local fallback', { key, error })
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

export const checkQuota = async (
  key: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now()
) => {
  const counter = await getCounter(key, windowMs, now)

  const allowed = counter.count <= maxRequests
  const retryAfter = Math.max(0, Math.ceil((counter.resetAt - now) / 1000))

  return { allowed, retryAfter }
}

export const clearInMemoryCounters = () => inMemoryCounters.clear()
export const getInMemoryCounterSize = () => inMemoryCounters.size

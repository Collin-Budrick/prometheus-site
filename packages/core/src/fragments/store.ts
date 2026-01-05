import { defaultFragmentLang, type FragmentLang } from './i18n'
import type { FragmentMeta } from './types'

export type StoredFragment = {
  payload: Uint8Array
  html?: string
  meta: FragmentMeta
  updatedAt: number
  staleAt: number
  expiresAt: number
}

export type FragmentWriteEntry = {
  cacheKey: string
  entry: StoredFragment
}

export type FragmentStoreAdapter = {
  mget?: (keys: string[]) => Promise<Array<string | Buffer | null | undefined>>
  set?: (key: string, value: string, ttlSeconds: number) => Promise<void>
  acquireLock?: (key: string, token: string, ttlMs: number) => Promise<boolean>
  releaseLock?: (key: string, token: string) => Promise<void>
  isLocked?: (key: string) => Promise<boolean>
}

export type FragmentStore = {
  readMany: (cacheKeys: string[]) => Promise<Map<string, StoredFragment | null>>
  writeMany: (entries: FragmentWriteEntry[]) => Promise<void>
  acquireLock: (id: string, lang: FragmentLang, ttlMs: number) => Promise<string | null>
  releaseLock: (id: string, lang: FragmentLang, token: string) => Promise<void>
  isLockHeld: (id: string, lang: FragmentLang) => Promise<boolean>
}

export const buildFragmentCacheKey = (id: string, lang: FragmentLang) => `${id}::${lang}`
export const fragmentLockTtlMs = 8_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseFragmentMeta = (value: unknown): FragmentMeta | null => {
  if (!isRecord(value)) return null
  const cacheKey = value.cacheKey
  const ttl = value.ttl
  const staleTtl = value.staleTtl
  const tags = value.tags
  const runtime = value.runtime

  if (typeof cacheKey !== 'string') return null
  if (typeof ttl !== 'number' || typeof staleTtl !== 'number') return null
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) return null
  if (runtime !== 'edge' && runtime !== 'node') return null

  return { cacheKey, ttl, staleTtl, tags, runtime }
}

const encodeEntry = (entry: StoredFragment) =>
  JSON.stringify({
    payload: Buffer.from(entry.payload).toString('base64'),
    html: entry.html,
    meta: entry.meta,
    updatedAt: entry.updatedAt,
    staleAt: entry.staleAt,
    expiresAt: entry.expiresAt
  })

const decodeEntry = (raw: string): StoredFragment | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const payload = parsed.payload
    const meta = parseFragmentMeta(parsed.meta)
    if (typeof payload !== 'string' || meta === null) return null
    return {
      payload: Uint8Array.from(Buffer.from(payload, 'base64')),
      html: typeof parsed.html === 'string' ? parsed.html : undefined,
      meta,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      staleAt: typeof parsed.staleAt === 'number' ? parsed.staleAt : Date.now(),
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : Date.now()
    }
  } catch {
    return null
  }
}

const decodeCacheValue = (value: unknown): StoredFragment | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return decodeEntry(value)
  if (value instanceof Buffer) return decodeEntry(value.toString())
  return null
}

const createLockToken = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const isExpired = (entry: StoredFragment, now: number) => entry.expiresAt <= now

export const createMemoryFragmentStore = (
  adapter: FragmentStoreAdapter = {}
): FragmentStore => {
  const memoryStore = new Map<string, StoredFragment>()
  const memoryStoreLimit = 256
  const memoryStoreCleanupIntervalMs = 30_000
  const lockKey = (id: string, lang: FragmentLang) => `fragment:lock:${id}::${lang}`
  const locks = new Map<string, { token: string; expiresAt: number }>()

  const deleteOldestMemoryEntry = () => {
    const oldestKey = memoryStore.keys().next().value
    if (oldestKey !== undefined) {
      memoryStore.delete(oldestKey)
    }
  }

  const enforceMemoryStoreLimit = () => {
    while (memoryStore.size > memoryStoreLimit) {
      deleteOldestMemoryEntry()
    }
  }

  const purgeExpiredMemoryEntries = (now: number = Date.now()) => {
    for (const [key, entry] of memoryStore) {
      if (isExpired(entry, now)) {
        memoryStore.delete(key)
      }
    }
  }

  const cleanupMemoryStore = () => {
    purgeExpiredMemoryEntries()
    enforceMemoryStoreLimit()
  }

  setInterval(cleanupMemoryStore, memoryStoreCleanupIntervalMs)

  const readMemoryEntry = (key: string): StoredFragment | null => {
    const entry = memoryStore.get(key)
    if (entry === undefined) return null

    const now = Date.now()
    if (isExpired(entry, now)) {
      memoryStore.delete(key)
      return null
    }

    memoryStore.delete(key)
    memoryStore.set(key, entry)
    return entry
  }

  const resolveLock = (id: string, lang: FragmentLang) => {
    const key = lockKey(id, lang)
    const value = locks.get(key)
    if (!value) return null
    if (value.expiresAt <= Date.now()) {
      locks.delete(key)
      return null
    }
    return { key, value }
  }

  return {
    readMany: async (cacheKeys: string[]) => {
      const uniqueKeys = Array.from(new Set(cacheKeys))
      const result = new Map<string, StoredFragment | null>()
      if (uniqueKeys.length === 0) return result

      if (adapter.mget) {
        try {
          const rawValues = await adapter.mget(uniqueKeys)
          uniqueKeys.forEach((key, index) => {
            const entry = decodeCacheValue(rawValues[index] ?? null)
            result.set(key, entry !== null && isExpired(entry, Date.now()) ? null : entry)
          })
          return result
        } catch {
          uniqueKeys.forEach((key) => result.set(key, null))
          return result
        }
      }

      uniqueKeys.forEach((key) => {
        result.set(key, readMemoryEntry(key))
      })
      return result
    },
    writeMany: async (entries: FragmentWriteEntry[]) => {
      entries.forEach(({ cacheKey, entry }) => {
        memoryStore.set(cacheKey, entry)
        enforceMemoryStoreLimit()
      })

      if (!adapter.set || entries.length === 0) return

      try {
        await Promise.all(
          entries.map(({ cacheKey, entry }) => {
            const ttlSeconds = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))
            return adapter.set?.(cacheKey, encodeEntry(entry), ttlSeconds)
          })
        )
      } catch {
        // ignore cache write failures
      }
    },
    acquireLock: async (id: string, lang: FragmentLang = defaultFragmentLang, ttlMs: number = fragmentLockTtlMs) => {
      const token = createLockToken()
      if (adapter.acquireLock) {
        try {
          const result = await adapter.acquireLock(lockKey(id, lang), token, ttlMs)
          return result ? token : null
        } catch {
          return null
        }
      }

      const existing = resolveLock(id, lang)
      if (existing) return null
      locks.set(lockKey(id, lang), { token, expiresAt: Date.now() + ttlMs })
      return token
    },
    releaseLock: async (id: string, lang: FragmentLang = defaultFragmentLang, token: string) => {
      if (adapter.releaseLock) {
        try {
          await adapter.releaseLock(lockKey(id, lang), token)
        } catch {
          // ignore lock release failures
        }
        return
      }

      const existing = resolveLock(id, lang)
      if (existing && existing.value.token === token) {
        locks.delete(existing.key)
      }
    },
    isLockHeld: async (id: string, lang: FragmentLang = defaultFragmentLang) => {
      if (adapter.isLocked) {
        try {
          return await adapter.isLocked(lockKey(id, lang))
        } catch {
          return false
        }
      }

      return resolveLock(id, lang) !== null
    }
  }
}

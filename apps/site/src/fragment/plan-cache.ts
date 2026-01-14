import {
  createFragmentPlanCache,
  type FragmentPlanCache,
  type FragmentPlanCacheEntry
} from '@core/fragments'

type StoredPlanCacheEntry = {
  entry: FragmentPlanCacheEntry
  savedAt: number
}

const STORAGE_KEY = 'fragment:plan-cache:v1'
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24
const DEFAULT_LIMIT = 20

const buildPlanCacheKey = (path: string, lang?: string) => `${lang ?? 'default'}|${path}`

const canUseStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const readStorage = (): Record<string, StoredPlanCacheEntry> => {
  if (!canUseStorage()) return {}
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, StoredPlanCacheEntry>
  } catch (error) {
    console.warn('Failed to parse fragment plan cache', error)
    return {}
  }
}

const writeStorage = (entries: Record<string, StoredPlanCacheEntry>) => {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (error) {
    console.warn('Failed to persist fragment plan cache', error)
  }
}

const createPersistentFragmentPlanCache = (
  limit: number = DEFAULT_LIMIT,
  ttlMs: number = DEFAULT_TTL_MS
): FragmentPlanCache => {
  const memoryCache = createFragmentPlanCache(limit)
  let storedEntries: Record<string, StoredPlanCacheEntry> | null = null

  const getStoredEntries = () => {
    if (!storedEntries) {
      storedEntries = readStorage()
    }
    return storedEntries
  }

  const isExpired = (savedAt: number) => Date.now() - savedAt > ttlMs

  const pruneStorage = () => {
    const entries = getStoredEntries()
    const keys = Object.keys(entries)
    if (!keys.length) return

    keys.forEach((key) => {
      if (isExpired(entries[key].savedAt)) {
        delete entries[key]
      }
    })

    const remainingKeys = Object.keys(entries)
    if (remainingKeys.length > limit) {
      const sorted = remainingKeys
        .map((key) => ({ key, savedAt: entries[key].savedAt }))
        .sort((a, b) => a.savedAt - b.savedAt)
      sorted.slice(0, remainingKeys.length - limit).forEach(({ key }) => {
        delete entries[key]
      })
    }

    writeStorage(entries)
  }

  const readStoredEntry = (key: string) => {
    const entries = getStoredEntries()
    const stored = entries[key]
    if (!stored) return undefined
    if (isExpired(stored.savedAt)) {
      delete entries[key]
      writeStorage(entries)
      return undefined
    }
    return stored.entry
  }

  const persistEntry = (key: string, entry: FragmentPlanCacheEntry) => {
    const entries = getStoredEntries()
    entries[key] = { entry, savedAt: Date.now() }
    writeStorage(entries)
  }

  return {
    get: (path, lang) => {
      const cached = memoryCache.get(path, lang)
      if (cached) return cached
      const key = buildPlanCacheKey(path, lang)
      const stored = readStoredEntry(key)
      if (stored) {
        memoryCache.set(path, lang, stored)
        return stored
      }
      return undefined
    },
    set: (path, lang, entry) => {
      memoryCache.set(path, lang, entry)
      if (!canUseStorage()) return
      pruneStorage()
      const requestKey = buildPlanCacheKey(path, lang)
      persistEntry(requestKey, entry)
      const normalizedKey = buildPlanCacheKey(entry.plan.path, lang)
      if (normalizedKey !== requestKey) {
        persistEntry(normalizedKey, entry)
      }
    }
  }
}

export const fragmentPlanCache = createPersistentFragmentPlanCache()
export { createPersistentFragmentPlanCache }

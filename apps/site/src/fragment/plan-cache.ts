import { createFragmentPlanCache, type FragmentPlanCacheEntry } from '@core/fragments'
import type { EarlyHint } from './types'

type FragmentPlanCacheEntryWithHints = FragmentPlanCacheEntry & {
  earlyHints?: EarlyHint[]
  initialHtml?: Record<string, string>
}

type FragmentPlanCacheWithHints = {
  get: (path: string, lang?: string) => FragmentPlanCacheEntryWithHints | undefined
  set: (path: string, lang: string | undefined, entry: FragmentPlanCacheEntryWithHints) => void
}

type StoredPlanCacheEntry = {
  entry: FragmentPlanCacheEntryWithHints
  savedAt: number
}

type FragmentPlanCachePayload = {
  version: 1
  entries: Record<string, StoredPlanCacheEntry>
}

const STORAGE_KEY = 'fragment:plan-cache:v2'
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24
const DEFAULT_LIMIT = 20
const FRAGMENT_PLAN_CACHE_PAYLOAD_ID = 'fragment-plan-cache'

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

const escapeJsonForScript = (value: string) => value.replace(/</g, '\\u003c')

const serializeFragmentPlanCachePayload = (payload: FragmentPlanCachePayload) =>
  escapeJsonForScript(JSON.stringify(payload))

const isStringRecord = (value: unknown): value is Record<string, string> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string')

const parseFragmentPlanCachePayload = (raw: string): FragmentPlanCachePayload | null => {
  try {
    const parsed = JSON.parse(raw) as FragmentPlanCachePayload
    if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
      return null
    }
    Object.values(parsed.entries).forEach((stored) => {
      if (!stored?.entry) return
      if (stored.entry.initialHtml !== undefined && !isStringRecord(stored.entry.initialHtml)) {
        delete stored.entry.initialHtml
      }
    })
    return parsed
  } catch {
    return null
  }
}

const buildCacheEntries = (
  path: string,
  lang: string | undefined,
  entry: FragmentPlanCacheEntryWithHints,
  savedAt: number
) => {
  const entries: Record<string, StoredPlanCacheEntry> = {}
  const requestKey = buildPlanCacheKey(path, lang)
  entries[requestKey] = { entry, savedAt }
  const normalizedKey = buildPlanCacheKey(entry.plan.path, lang)
  if (normalizedKey !== requestKey) {
    entries[normalizedKey] = { entry, savedAt }
  }
  return entries
}

export const createFragmentPlanCachePayload = (
  path: string,
  lang: string | undefined,
  entry: FragmentPlanCacheEntryWithHints,
  savedAt: number = Date.now()
) => {
  const payload: FragmentPlanCachePayload = {
    version: 1,
    entries: buildCacheEntries(path, lang, entry, savedAt)
  }

  try {
    return serializeFragmentPlanCachePayload(payload)
  } catch (error) {
    console.warn('Failed to serialize fragment plan cache payload', error)
    return null
  }
}

const readServerPayload = (): Record<string, StoredPlanCacheEntry> => {
  if (typeof document === 'undefined') return {}
  const element = document.getElementById(FRAGMENT_PLAN_CACHE_PAYLOAD_ID)
  if (!element) return {}
  const raw = element.textContent
  element.remove()
  if (!raw) return {}
  const parsed = parseFragmentPlanCachePayload(raw)
  if (!parsed) {
    console.warn('Failed to parse fragment plan cache payload')
    return {}
  }
  return parsed.entries
}

const createPersistentFragmentPlanCache = (
  limit: number = DEFAULT_LIMIT,
  ttlMs: number = DEFAULT_TTL_MS
): FragmentPlanCacheWithHints => {
  const memoryCache = createFragmentPlanCache(limit) as FragmentPlanCacheWithHints
  let storedEntries: Record<string, StoredPlanCacheEntry> | null = null

  const isExpired = (savedAt: number) => Date.now() - savedAt > ttlMs

  const pruneEntries = (entries: Record<string, StoredPlanCacheEntry>) => {
    const keys = Object.keys(entries)
    if (!keys.length) return false

    let changed = false
    keys.forEach((key) => {
      if (isExpired(entries[key].savedAt)) {
        delete entries[key]
        changed = true
      }
    })

    const remainingKeys = Object.keys(entries)
    if (remainingKeys.length > limit) {
      const sorted = remainingKeys
        .map((key) => ({ key, savedAt: entries[key].savedAt }))
        .sort((a, b) => a.savedAt - b.savedAt)
      sorted.slice(0, remainingKeys.length - limit).forEach(({ key }) => {
        delete entries[key]
        changed = true
      })
    }
    return changed
  }

  const mergeStoredEntries = (
    primary: Record<string, StoredPlanCacheEntry>,
    secondary: Record<string, StoredPlanCacheEntry>
  ) => {
    const merged: Record<string, StoredPlanCacheEntry> = {}
    const assignEntries = (entries: Record<string, StoredPlanCacheEntry>) => {
      Object.keys(entries).forEach((key) => {
        const existing = merged[key]
        if (!existing || entries[key].savedAt > existing.savedAt) {
          merged[key] = entries[key]
        }
      })
    }
    assignEntries(secondary)
    assignEntries(primary)
    return merged
  }

  const getStoredEntries = () => {
    if (!storedEntries) {
      const serverEntries = readServerPayload()
      const storageEntries = readStorage()
      storedEntries = mergeStoredEntries(serverEntries, storageEntries)
      if (pruneEntries(storedEntries) && canUseStorage()) {
        writeStorage(storedEntries)
      }
    }
    return storedEntries
  }

  const pruneStorage = () => {
    const entries = getStoredEntries()
    if (pruneEntries(entries)) {
      writeStorage(entries)
    }
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

  const persistEntry = (key: string, entry: FragmentPlanCacheEntryWithHints, savedAt: number = Date.now()) => {
    const entries = getStoredEntries()
    entries[key] = { entry, savedAt }
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
      const savedAt = Date.now()
      Object.keys(buildCacheEntries(path, lang, entry, savedAt)).forEach((key) => {
        persistEntry(key, entry, savedAt)
      })
    }
  }
}

export const fragmentPlanCache = createPersistentFragmentPlanCache()
export { createPersistentFragmentPlanCache, FRAGMENT_PLAN_CACHE_PAYLOAD_ID }

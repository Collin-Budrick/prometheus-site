import { createFragmentPlanCache, type FragmentPlanCacheEntry } from '@core/fragment/plan-cache'
import type { EarlyHint } from './types'
import { PUBLIC_FRAGMENT_CACHE_SCOPE } from './cache-scope'
import { normalizeRoutePath } from '../shared/route-navigation'

type FragmentPlanCacheEntryWithHints = FragmentPlanCacheEntry & {
  earlyHints?: EarlyHint[]
  initialHtml?: Record<string, string>
}

type FragmentPlanCacheWithHints = {
  get: (
    path: string,
    lang?: string,
    options?: {
      scopeKey?: string | null
    }
  ) => FragmentPlanCacheEntryWithHints | undefined
  set: (
    path: string,
    lang: string | undefined,
    entry: FragmentPlanCacheEntryWithHints,
    options?: {
      scopeKey?: string | null
    }
  ) => void
  delete?: (
    path: string,
    lang?: string,
    options?: {
      scopeKey?: string | null
    }
  ) => void
  clearScope?: (scopeKey: string) => void
  clear?: () => void
}

type StoredPlanCacheEntry = {
  entry: FragmentPlanCacheEntryWithHints
  savedAt: number
}

type FragmentPlanCachePayload = {
  version: 2
  entries: Record<string, StoredPlanCacheEntry>
}

const STORAGE_KEY = 'fragment:plan-cache:v3'
const FRAGMENT_PLAN_CACHE_PAYLOAD_ID = 'fragment-plan-cache'

const normalizeScopeKey = (value?: string | null) => {
  if (typeof value !== 'string') return PUBLIC_FRAGMENT_CACHE_SCOPE
  const normalized = value.trim()
  return normalized || PUBLIC_FRAGMENT_CACHE_SCOPE
}

const buildPlanCacheKey = (scopeKey: string, path: string, lang?: string) =>
  `${normalizeScopeKey(scopeKey)}|${lang ?? 'default'}|${normalizeRoutePath(path)}`

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

const clearStorage = () => {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.warn('Failed to clear fragment plan cache storage', error)
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
    if (!parsed || parsed.version !== 2 || !parsed.entries || typeof parsed.entries !== 'object') {
      return null
    }
    Object.values(parsed.entries).forEach((stored) => {
      if (!stored?.entry) return
      if (stored.entry.initialHtml !== undefined && !isStringRecord(stored.entry.initialHtml)) {
        delete stored.entry.initialHtml
      }
    })
    return parsed
  } catch (error) {
    console.warn('Failed to parse fragment plan cache payload from DOM script tag', error)
    return null
  }
}

const buildCacheEntries = (
  scopeKey: string,
  path: string,
  lang: string | undefined,
  entry: FragmentPlanCacheEntryWithHints,
  savedAt: number
) => {
  const entries: Record<string, StoredPlanCacheEntry> = {}
  const requestKey = buildPlanCacheKey(scopeKey, path, lang)
  entries[requestKey] = { entry, savedAt }
  const normalizedKey = buildPlanCacheKey(scopeKey, entry.plan.path, lang)
  if (normalizedKey !== requestKey) {
    entries[normalizedKey] = { entry, savedAt }
  }
  return entries
}

export const createFragmentPlanCachePayload = (
  path: string,
  lang: string | undefined,
  entry: FragmentPlanCacheEntryWithHints,
  options?: {
    scopeKey?: string | null
  },
  savedAt: number = Date.now()
) => {
  const payload: FragmentPlanCachePayload = {
    version: 2,
    entries: buildCacheEntries(normalizeScopeKey(options?.scopeKey), path, lang, entry, savedAt)
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

const createPersistentFragmentPlanCache = (): FragmentPlanCacheWithHints => {
  const memoryCache = createFragmentPlanCache(Number.MAX_SAFE_INTEGER) as FragmentPlanCacheWithHints
  let storedEntries: Record<string, StoredPlanCacheEntry> | null = null

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
    }
    return storedEntries
  }

  const readStoredEntry = (key: string) => {
    const entries = getStoredEntries()
    return entries[key]?.entry
  }

  const persistEntry = (key: string, entry: FragmentPlanCacheEntryWithHints, savedAt: number = Date.now()) => {
    const entries = getStoredEntries()
    entries[key] = { entry, savedAt }
    writeStorage(entries)
  }

  return {
    get: (path, lang, options) => {
      const scopeKey = normalizeScopeKey(options?.scopeKey)
      const cached = memoryCache.get(buildPlanCacheKey(scopeKey, path, lang), lang)
      if (cached) return cached
      const key = buildPlanCacheKey(scopeKey, path, lang)
      const stored = readStoredEntry(key)
      if (stored) {
        memoryCache.set(key, lang, stored)
        return stored
      }
      return undefined
    },
    set: (path, lang, entry, options) => {
      const scopeKey = normalizeScopeKey(options?.scopeKey)
      const requestKey = buildPlanCacheKey(scopeKey, path, lang)
      memoryCache.set(requestKey, lang, entry)
      if (!canUseStorage()) return
      const savedAt = Date.now()
      Object.keys(buildCacheEntries(scopeKey, path, lang, entry, savedAt)).forEach((key) => {
        persistEntry(key, entry, savedAt)
      })
    },
    delete: (path, lang, options) => {
      const scopeKey = normalizeScopeKey(options?.scopeKey)
      const requestKey = buildPlanCacheKey(scopeKey, path, lang)
      const entries = getStoredEntries()
      delete entries[requestKey]
      if (canUseStorage()) {
        writeStorage(entries)
      }
    },
    clearScope: (scopeKey) => {
      const normalizedScopeKey = `${normalizeScopeKey(scopeKey)}|`
      const entries = getStoredEntries()
      Object.keys(entries).forEach((key) => {
        if (key.startsWith(normalizedScopeKey)) {
          delete entries[key]
        }
      })
      if (canUseStorage()) {
        writeStorage(entries)
      }
      memoryCache.clear?.()
    },
    clear: () => {
      memoryCache.clear?.()
      storedEntries = {}
      clearStorage()
    }
  }
}

export const fragmentPlanCache = createPersistentFragmentPlanCache()
export const clearFragmentPlanCache = () => {
  fragmentPlanCache.clear?.()
}
export { createPersistentFragmentPlanCache, FRAGMENT_PLAN_CACHE_PAYLOAD_ID }

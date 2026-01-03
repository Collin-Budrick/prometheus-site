import { isValkeyReady, valkey } from '../services/cache'
import { defaultFragmentLang, type FragmentLang } from './i18n'
import type { FragmentMeta } from './types'

type StoredFragment = {
  payload: Uint8Array
  html?: string
  meta: FragmentMeta
  updatedAt: number
  staleAt: number
  expiresAt: number
}

const memoryStore = new Map<string, StoredFragment>()
const lockKey = (id: string, lang: FragmentLang) => `fragment:lock:${id}::${lang}`
export const fragmentLockTtlMs = 8_000
const releaseLockScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`

const createLockToken = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

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
    const parsed = JSON.parse(raw) as {
      payload?: string
      html?: string
      meta?: FragmentMeta
      updatedAt?: number
      staleAt?: number
      expiresAt?: number
    }
    if (!parsed.payload || !parsed.meta) return null
    return {
      payload: Uint8Array.from(Buffer.from(parsed.payload, 'base64')),
      html: typeof parsed.html === 'string' ? parsed.html : undefined,
      meta: parsed.meta,
      updatedAt: parsed.updatedAt ?? Date.now(),
      staleAt: parsed.staleAt ?? Date.now(),
      expiresAt: parsed.expiresAt ?? Date.now()
    }
  } catch {
    return null
  }
}

export const buildFragmentCacheKey = (id: string, lang: FragmentLang) => `${id}::${lang}`

export const readFragment = async (
  id: string,
  lang: FragmentLang = defaultFragmentLang
): Promise<StoredFragment | null> => {
  const cacheKey = buildFragmentCacheKey(id, lang)
  if (isValkeyReady()) {
    try {
      const cached = await valkey.get(cacheKey)
      if (!cached) return null
      return decodeEntry(cached)
    } catch {
      return null
    }
  }

  return memoryStore.get(cacheKey) ?? null
}

export const writeFragment = async (
  id: string,
  lang: FragmentLang = defaultFragmentLang,
  entry: StoredFragment
) => {
  const cacheKey = buildFragmentCacheKey(id, lang)
  memoryStore.set(cacheKey, entry)
  if (!isValkeyReady()) return

  const ttlSeconds = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))
  try {
    await valkey.set(cacheKey, encodeEntry(entry), { EX: ttlSeconds })
  } catch {
    // ignore cache write failures
  }
}

export const acquireFragmentLock = async (
  id: string,
  lang: FragmentLang = defaultFragmentLang,
  ttlMs: number = fragmentLockTtlMs
): Promise<string | null> => {
  if (!isValkeyReady()) return null
  const token = createLockToken()
  try {
    const result = await valkey.set(lockKey(id, lang), token, { NX: true, PX: ttlMs })
    return result ? token : null
  } catch {
    return null
  }
}

export const releaseFragmentLock = async (
  id: string,
  lang: FragmentLang = defaultFragmentLang,
  token: string
) => {
  if (!isValkeyReady()) return
  try {
    await valkey.eval(releaseLockScript, { keys: [lockKey(id, lang)], arguments: [token] })
  } catch {
    // ignore lock release failures
  }
}

export const isFragmentLockHeld = async (
  id: string,
  lang: FragmentLang = defaultFragmentLang
): Promise<boolean> => {
  if (!isValkeyReady()) return false
  try {
    const result = await valkey.exists(lockKey(id, lang))
    return result === 1
  } catch {
    return false
  }
}

export type { StoredFragment }

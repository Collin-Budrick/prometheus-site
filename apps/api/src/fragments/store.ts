import { isValkeyReady, valkey } from '../services/cache'
import {
  buildFragmentCacheKey,
  createMemoryFragmentStore,
  type FragmentStore,
  type FragmentStoreAdapter,
  type StoredFragment
} from '@core/fragments'
import { defaultFragmentLang, type FragmentLang } from './i18n'

const releaseLockScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`

const adapter: FragmentStoreAdapter = {
  mget: async (keys) => {
    if (!isValkeyReady()) return keys.map(() => null)
    const [rawValues = []] = await valkey.multi().mGet(keys).execAsPipeline()
    return rawValues as Array<string | Buffer | null | undefined>
  },
  set: async (key, value, ttlSeconds) => {
    if (!isValkeyReady()) return
    await valkey.set(key, value, { EX: ttlSeconds })
  },
  acquireLock: async (key, token, ttlMs) => {
    if (!isValkeyReady()) return false
    const result = await valkey.set(key, token, { NX: true, PX: ttlMs })
    return result !== null
  },
  releaseLock: async (key, token) => {
    if (!isValkeyReady()) return
    await valkey.eval(releaseLockScript, { keys: [key], arguments: [token] })
  },
  isLocked: async (key) => {
    if (!isValkeyReady()) return false
    const result = await valkey.exists(key)
    return result === 1
  }
}

export const fragmentStore: FragmentStore = createMemoryFragmentStore(adapter)

export const readFragment = async (id: string, lang: FragmentLang = defaultFragmentLang): Promise<StoredFragment | null> => {
  const cacheKey = buildFragmentCacheKey(id, lang)
  const cached = await fragmentStore.readMany([cacheKey])
  return cached.get(cacheKey) ?? null
}

export type { StoredFragment }
export { buildFragmentCacheKey, fragmentLockTtlMs }

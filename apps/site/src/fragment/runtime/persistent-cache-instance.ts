import { createPersistentRuntimeCache } from './persistent-cache'

let persistentRuntimeCache: ReturnType<typeof createPersistentRuntimeCache> | null = null

export const getPersistentRuntimeCache = () => {
  persistentRuntimeCache ??= createPersistentRuntimeCache()
  return persistentRuntimeCache
}

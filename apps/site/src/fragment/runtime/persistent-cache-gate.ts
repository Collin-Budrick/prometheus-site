type HydratablePersistentCache = {
  hydrate: () => Promise<unknown>
  isHydrated: () => boolean
}

export const createPersistentCacheReadyGate = (cache: HydratablePersistentCache) => {
  let pending: Promise<void> | null = null

  return async () => {
    if (cache.isHydrated()) {
      return
    }
    if (!pending) {
      pending = cache
        .hydrate()
        .catch(() => undefined)
        .then(() => undefined)
        .finally(() => {
          pending = null
        })
    }
    await pending
  }
}

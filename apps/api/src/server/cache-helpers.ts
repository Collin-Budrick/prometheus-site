import { isValkeyReady, valkey } from '../services/cache'

export const storeItemsCachePrefix = 'store:items:'

export const buildStoreItemsCacheKey = (cursor: number, limit: number) =>
  `${storeItemsCachePrefix}${cursor}:${limit}`

export const invalidateStoreItemsCache = async () => {
  if (!isValkeyReady()) return

  try {
    const keys = await valkey.keys(`${storeItemsCachePrefix}*`)
    if (keys.length > 0) {
      await valkey.del(...keys)
    }
  } catch (error) {
    console.warn('Failed to invalidate store cache keys', error)
  }
}

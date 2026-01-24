import type { ValkeyClientType } from '@valkey/client'

export const storeItemsCachePrefix = 'store:items:'

export const buildStoreItemsCacheKey = (cursor: number, limit: number, sort: string, dir: string) =>
  `${storeItemsCachePrefix}${cursor}:${limit}:${sort}:${dir}`

export const invalidateStoreItemsCache = async (client: ValkeyClientType, isReady: () => boolean) => {
  if (!isReady()) return

  try {
    const keys = await client.keys(`${storeItemsCachePrefix}*`)
    if (keys.length > 0) {
      await client.del(keys)
    }
  } catch (error) {
    console.warn('Failed to invalidate store cache keys', error)
  }
}

import { createContextId, useContext } from '@builder.io/qwik'

export type StoreStreamSeed = {
  items?: unknown[]
  searchMeta?: { total: number; query: string } | null
  query?: string
}

export type StoreCartSeed = {
  items?: unknown[]
  queuedCount?: number
}

export type StoreSeed = {
  stream?: StoreStreamSeed | null
  cart?: StoreCartSeed | null
}

export const StoreSeedContext = createContextId<StoreSeed | null>('store-seed')

export const useStoreSeed = () => useContext(StoreSeedContext) ?? null

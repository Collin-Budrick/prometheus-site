import type { RequestHandler } from '@builder.io/qwik-city'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
export { StoreRoute as default, StoreSkeleton as skeleton, storeHead as head } from '@features/store'

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

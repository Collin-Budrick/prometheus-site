import type { RequestHandler } from '@builder.io/qwik-city'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
export { LoginRoute as default, LoginSkeleton as skeleton, loginHead as head } from '@features/auth'

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

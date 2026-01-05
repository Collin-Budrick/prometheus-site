import type { RequestHandler } from '@builder.io/qwik-city'
import { createCacheHandler, PUBLIC_SWR_CACHE } from '../cache-headers'
export { LabRoute as default, LabSkeleton as skeleton, labHead as head } from '@features/lab'

export const onGet: RequestHandler = createCacheHandler(PUBLIC_SWR_CACHE)

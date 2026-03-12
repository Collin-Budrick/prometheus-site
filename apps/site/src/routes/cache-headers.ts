import type { RequestHandler } from '@builder.io/qwik-city'

export const PUBLIC_SWR_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
// Keep authenticated pages out of shared caches without disabling browser revalidation and bfcache.
export const PRIVATE_REVALIDATE_CACHE = 'private, no-cache, max-age=0, must-revalidate'

export const createCacheHandler = (cacheControl: string): RequestHandler => ({ headers }) => {
  headers.set('Cache-Control', cacheControl)
}

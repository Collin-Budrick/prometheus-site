import type { RequestHandler } from '@builder.io/qwik-city'

export const PUBLIC_SWR_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
export const PRIVATE_NO_STORE_CACHE = 'private, no-store'

export const createCacheHandler = (cacheControl: string): RequestHandler => ({ headers }) => {
  headers.set('Cache-Control', cacheControl)
}


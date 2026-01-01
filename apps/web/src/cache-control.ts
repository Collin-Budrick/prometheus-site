// Default public caching: no fresh max-age, but allow a 60s stale window while revalidating.
export const PUBLIC_CACHE_CONTROL = 'public, max-age=0, stale-while-revalidate=60'

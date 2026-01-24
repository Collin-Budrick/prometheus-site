// Default public caching: no fresh max-age, but allow CDN reuse with a 60s stale window while revalidating.
export const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=60'

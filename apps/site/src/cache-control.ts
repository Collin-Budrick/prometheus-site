// Default public caching: no fresh max-age, but allow CDN reuse with a longer shared cache window.
export const PUBLIC_CACHE_CONTROL =
  'public, max-age=0, s-maxage=300, stale-while-revalidate=60, stale-if-error=86400'

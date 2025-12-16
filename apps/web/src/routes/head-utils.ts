const validPreloadAs = new Set(['style', 'script', 'fetch', 'image', 'worker'])

export const sanitizeHeadLinks = (
  links: { rel?: string; href?: unknown; as?: unknown }[] | undefined,
  isDev: boolean
) => {
  const seenPreloadHref = new Set<string>()

  return (links ?? []).filter((link) => {
    if (link.rel !== 'preload') return true
    if (isDev) return false

    const href = (link as { href?: unknown }).href
    const as = (link as { as?: unknown }).as
    if (typeof href !== 'string' || href.trim().length === 0) return false
    if (typeof as !== 'string' || !validPreloadAs.has(as)) return false
    if (as === 'font') return false
    if (seenPreloadHref.has(href)) return false

    seenPreloadHref.add(href)
    return true
  })
}

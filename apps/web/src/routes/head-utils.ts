import type { DocumentLink } from '@builder.io/qwik-city'

const validPreloadAs = new Set(['style', 'font'])

export const sanitizeHeadLinks = (
  links: readonly DocumentLink[] | undefined,
  isDev: boolean,
  allowedPreloads?: Set<string>
): DocumentLink[] => {
  const seenPreloadHref = new Set<string>()

  return Array.from(links ?? []).filter((link) => {
    if (link.rel !== 'preload') return true
    if (isDev) return false

    const href = link.href
    const as = link.as
    if (typeof href !== 'string' || href.trim().length === 0) return false
    if (allowedPreloads && !allowedPreloads.has(href)) return false
    if (typeof as !== 'string' || !validPreloadAs.has(as)) return false
    if (seenPreloadHref.has(href)) return false

    seenPreloadHref.add(href)
    return true
  })
}

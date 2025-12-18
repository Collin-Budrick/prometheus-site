import type { DocumentLink } from '@builder.io/qwik-city'
import { criticalCssHref } from './critical-css-assets'

export type PreloadEntry = { pattern: RegExp; links: DocumentLink[] }

const manifest: PreloadEntry[] = [
  {
    pattern: /^\/(?:.*)?$/,
    links: [{ rel: 'preload', href: criticalCssHref, as: 'style' }]
  }
]

export const resolveCriticalPreloads = (pathname: string, isDev: boolean): DocumentLink[] => {
  if (isDev) return []

  const seen = new Set<string>()

  return manifest
    .filter(({ pattern }) => pattern.test(pathname))
    .flatMap(({ links }) => links)
    .filter((link) => {
      const href = link.href
      if (typeof href !== 'string' || href.trim().length === 0) return false

      const key = `${link.rel}:${href}`
      if (seen.has(key)) return false

      seen.add(key)
      return true
    })
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export const allowedPreloadHrefs = new Set(
  manifest
    .flatMap(({ links }) => links)
    .filter((link) => link.rel === 'preload')
    .map((link) => link.href)
    .filter(isNonEmptyString)
)

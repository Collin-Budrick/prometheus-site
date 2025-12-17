import type { DocumentLink } from '@builder.io/qwik-city'

export type PreloadEntry = { pattern: RegExp; links: DocumentLink[] }

const baseStylePreload: DocumentLink = {
  rel: 'preload',
  href: '/assets/critical.css',
  as: 'style'
}

const manifest: PreloadEntry[] = [{ pattern: /^\/.*$/, links: [baseStylePreload] }]

export const resolveCriticalPreloads = (pathname: string, isDev: boolean): DocumentLink[] => {
  if (isDev) return []

  const match = manifest.find(({ pattern }) => pattern.test(pathname))
  return match ? [...match.links] : []
}

export const allowedPreloadHrefs = new Set(manifest.flatMap(({ links }) => links.map((link) => link.href)))

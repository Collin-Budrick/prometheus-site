import type { DocumentLink } from '@builder.io/qwik-city'

export type PreloadEntry = { pattern: RegExp; links: DocumentLink[] }

const baseStylePreload: DocumentLink = {
  rel: 'preload',
  href: '/assets/critical.css',
  as: 'style',
  crossOrigin: 'anonymous'
}

const documentPreload = (pathname: string): DocumentLink => ({
  rel: 'preload',
  href: pathname || '/',
  as: 'document'
})

const manifest: PreloadEntry[] = [
  { pattern: /^\/$/, links: [documentPreload('/'), baseStylePreload] },
  { pattern: /^\/store(?:\/|$)/, links: [documentPreload('/store'), baseStylePreload] },
  { pattern: /^\/chat(?:\/|$)/, links: [documentPreload('/chat'), baseStylePreload] },
  { pattern: /^\/ai(?:\/|$)/, links: [documentPreload('/ai'), baseStylePreload] }
]

export const resolveCriticalPreloads = (pathname: string, isDev: boolean): DocumentLink[] => {
  if (isDev) return []

  const match = manifest.find(({ pattern }) => pattern.test(pathname))
  return match ? [...match.links] : [documentPreload(pathname), baseStylePreload]
}

export const allowedPreloadHrefs = new Set(manifest.flatMap(({ links }) => links.map((link) => link.href)))

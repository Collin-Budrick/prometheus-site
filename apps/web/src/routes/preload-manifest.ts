import type { DocumentLink } from '@builder.io/qwik-city'

export type PreloadEntry = { pattern: RegExp; links: DocumentLink[] }

const manifest: PreloadEntry[] = []

export const resolveCriticalPreloads = (pathname: string, isDev: boolean): DocumentLink[] => {
  void pathname
  void isDev
  return []
}

export const allowedPreloadHrefs = new Set(manifest.flatMap(({ links }) => links.map((link) => link.href)))

import type { DocumentLink } from '@builder.io/qwik-city'

export type PreloadEntry = { pattern: RegExp; links: DocumentLink[] }

const baseCss: DocumentLink[] = [
  { rel: 'preload', href: '/assets/critical.css', as: 'style', crossorigin: 'anonymous' },
  { rel: 'preload', href: '/assets/PkrpP_CG-style.css', as: 'style', crossorigin: 'anonymous' }
]

const baseRuntime: DocumentLink[] = [
  { rel: 'preload', href: '/build/q-idPPhgwJ.js', as: 'script', crossorigin: 'anonymous' },
  { rel: 'preload', href: '/build/q-DKDTCsAo.js', as: 'script', crossorigin: 'anonymous' }
]

const manifest: PreloadEntry[] = [
  {
    pattern: /^\/?$/,
    links: [
      { rel: 'preload', href: '/', as: 'document', crossorigin: 'anonymous' },
      ...baseCss,
      ...baseRuntime,
      { rel: 'preload', href: '/build/q-CaHuLuMi.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-DmM4Tt-D.js', as: 'script', crossorigin: 'anonymous' }
    ]
  },
  {
    pattern: /^\/store(?:\/|$)/,
    links: [
      { rel: 'preload', href: '/store', as: 'document', crossorigin: 'anonymous' },
      ...baseCss,
      ...baseRuntime,
      { rel: 'preload', href: '/build/q-B87jFo8T.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-D0A4uRex.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-BKGIBNq1.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-ZxYqGR3W.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-g1o6JuIC.js', as: 'script', crossorigin: 'anonymous' }
    ]
  },
  {
    pattern: /^\/chat(?:\/|$)/,
    links: [
      { rel: 'preload', href: '/chat', as: 'document', crossorigin: 'anonymous' },
      ...baseCss,
      ...baseRuntime,
      { rel: 'preload', href: '/build/q-XWCE1vqC.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-DeMIJTvs.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-CRlLHquq.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-C4urO_RL.js', as: 'script', crossorigin: 'anonymous' }
    ]
  },
  {
    pattern: /^\/ai(?:\/|$)/,
    links: [
      { rel: 'preload', href: '/ai', as: 'document', crossorigin: 'anonymous' },
      ...baseCss,
      ...baseRuntime,
      { rel: 'preload', href: '/build/q-C4nvIbvE.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-Dl8rFEar.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-D2DWvxIj.js', as: 'script', crossorigin: 'anonymous' },
      { rel: 'preload', href: '/build/q-BybU_JHe.js', as: 'script', crossorigin: 'anonymous' }
    ]
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

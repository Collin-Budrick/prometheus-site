import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { getSpeculationMode } from '../src/config/page-config'

let sanitizeHeadLinks: typeof import('../src/routes/[locale]/layout').sanitizeHeadLinks
let resolveNavigationSpeculationCandidates: typeof import('../src/routes/[locale]/layout').resolveNavigationSpeculationCandidates

beforeAll(async () => {
  mock.module('@qwik-city-plan', () => ({ default: {} }))
  mock.module('@qwik-city-sw-register', () => ({ default: () => null }))
  ;({ sanitizeHeadLinks, resolveNavigationSpeculationCandidates } = await import('../src/routes/[locale]/layout'))
})

const l = (input: Record<string, unknown>) => input
const sensitiveRoutes = ['/login', '/register', '/register-passkey', '/dashboard', '/account', '/settings']

describe('sanitizeHeadLinks', () => {
  it('drops all preloads during dev to avoid noisy console warnings', () => {
    const links = [
      l({ rel: 'preload', href: '/fonts/inter-var.woff2', as: 'font' }),
      l({ rel: 'preload', href: '/style.css', as: 'style' }),
      l({ rel: 'stylesheet', href: '/style.css' })
    ]

    const allowed = new Set(['/style.css', '/fonts/inter-var.woff2'])
    const result = sanitizeHeadLinks(links, true, allowed)

    expect(result).toEqual([l({ rel: 'stylesheet', href: '/style.css' })])
  })

  it('keeps only allowlisted, well-formed preloads in production', () => {
    const links = [
      l({ rel: 'preload', href: '/style.css', as: 'style' }),
      l({ rel: 'preload', href: '/style.css', as: 'style' }), // duplicate
      l({ rel: 'preload', href: '/fonts/inter-var.woff2', as: 'font' }),
      l({ rel: 'preload', href: '', as: 'script' }), // empty href
      l({ rel: 'preload', href: '/no-as.js' }), // missing as
      l({ rel: 'preload', href: '/unknown', as: 'unknown' }), // invalid as
      l({ rel: 'preload', href: '/ignore.css', as: 'style' }), // not allowlisted
      l({ rel: 'canonical', href: '/home' })
    ]

    const allowed = new Set(['/style.css', '/fonts/inter-var.woff2'])
    const result = sanitizeHeadLinks(links, false, allowed)

    expect(result).toEqual([
      l({ rel: 'preload', href: '/style.css', as: 'style' }),
      l({ rel: 'preload', href: '/fonts/inter-var.woff2', as: 'font' }),
      l({ rel: 'canonical', href: '/home' })
    ])
  })
})

describe('speculation safety', () => {
  it('marks sensitive routes as non-prerender', () => {
    sensitiveRoutes.forEach((path) => {
      expect(getSpeculationMode(path)).not.toBe('prerender')
    })
  })

  it('avoids prerender hints for sensitive navigation targets', () => {
    const candidates = resolveNavigationSpeculationCandidates('/noop', '')
    const sensitiveHints = candidates.filter(
      ({ url, action }) => action === 'prerender' && sensitiveRoutes.some((path) => url === path)
    )
    expect(sensitiveHints).toHaveLength(0)
  })
})

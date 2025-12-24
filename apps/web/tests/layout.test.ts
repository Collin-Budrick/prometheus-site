import { beforeAll, describe, expect, it, mock } from 'bun:test'

let sanitizeHeadLinks: typeof import('../src/routes/[locale]/layout').sanitizeHeadLinks

beforeAll(async () => {
  mock.module('@qwik-city-plan', () => ({ default: {} }))
  mock.module('@qwik-city-sw-register', () => ({ default: () => null }))
  ;({ sanitizeHeadLinks } = await import('../src/routes/[locale]/layout'))
})

const l = (input: Record<string, unknown>) => input

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

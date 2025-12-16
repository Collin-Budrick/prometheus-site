import { describe, expect, it } from 'bun:test'
import { sanitizeHeadLinks } from './head-utils'

const l = (input: Record<string, unknown>) => input

describe('sanitizeHeadLinks', () => {
  it('drops all preloads during dev to avoid noisy console warnings', () => {
    const links = [
      l({ rel: 'preload', href: '/fonts/inter-var.woff2', as: 'font' }),
      l({ rel: 'preload', href: '/style.css', as: 'style' }),
      l({ rel: 'stylesheet', href: '/style.css' })
    ]

    const result = sanitizeHeadLinks(links, true)

    expect(result).toEqual([l({ rel: 'stylesheet', href: '/style.css' })])
  })

  it('keeps only well-formed, non-font preloads in production', () => {
    const links = [
      l({ rel: 'preload', href: '/style.css', as: 'style' }),
      l({ rel: 'preload', href: '/style.css', as: 'style' }), // duplicate
      l({ rel: 'preload', href: '/entry.js', as: 'script' }),
      l({ rel: 'preload', href: '/img.png', as: 'image' }),
      l({ rel: 'preload', href: '/fonts/inter-var.woff2', as: 'font' }), // font should be dropped
      l({ rel: 'preload', href: '', as: 'script' }), // empty href
      l({ rel: 'preload', href: '/no-as.js' }), // missing as
      l({ rel: 'preload', href: '/unknown', as: 'unknown' }), // invalid as
      l({ rel: 'canonical', href: '/home' })
    ]

    const result = sanitizeHeadLinks(links, false)

    expect(result).toEqual([
      l({ rel: 'preload', href: '/style.css', as: 'style' }),
      l({ rel: 'preload', href: '/entry.js', as: 'script' }),
      l({ rel: 'preload', href: '/img.png', as: 'image' }),
      l({ rel: 'canonical', href: '/home' })
    ])
  })
})

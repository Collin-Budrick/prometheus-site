import { describe, expect, it } from 'bun:test'
import { toCanonicalStaticShellHref } from './constants'

describe('toCanonicalStaticShellHref', () => {
  it('adds trailing slashes for static-shell routes while preserving search params', () => {
    expect(toCanonicalStaticShellHref('/store?lang=en')).toBe('/store/?lang=en')
    expect(toCanonicalStaticShellHref('/lab#demo')).toBe('/lab/#demo')
    expect(toCanonicalStaticShellHref('/settings?lang=en#panel')).toBe('/settings/?lang=en#panel')
  })

  it('leaves non-static routes unchanged', () => {
    expect(toCanonicalStaticShellHref('/api/health')).toBe('/api/health')
    expect(toCanonicalStaticShellHref('https://example.com')).toBe('https://example.com')
  })
})

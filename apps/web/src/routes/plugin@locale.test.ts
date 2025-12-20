import { describe, expect, it } from 'bun:test'
import { resolveLocaleRedirect } from './plugin@locale'

describe('resolveLocaleRedirect', () => {
  it('rewrites locale query params into the path prefix', () => {
    expect(resolveLocaleRedirect('/ai', '?locale=en', 'en')).toBe('/en/ai')
    expect(resolveLocaleRedirect('/en/ai', '?locale=ko', 'ko')).toBe('/ko/ai')
  })

  it('removes the locale query param while preserving other search params', () => {
    expect(resolveLocaleRedirect('/en/ai', '?locale=ko&ref=nav', 'ko')).toBe('/ko/ai?ref=nav')
  })

  it('returns null when no locale query param is present', () => {
    expect(resolveLocaleRedirect('/en/ai', '', null)).toBeNull()
  })
})


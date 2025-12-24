import { describe, expect, it } from 'bun:test'
import { resolveRootLocaleDecision } from './root-locale'

describe('resolveRootLocaleDecision', () => {
  it('redirects non-default locales to the localized root path', () => {
    const result = resolveRootLocaleDecision({
      cookieLocale: 'ko'
    })

    expect(result.preferred).toBe('ko')
    expect(result.redirect).toBe('/ko')
  })

  it('strips the locale query parameter when redirecting', () => {
    const result = resolveRootLocaleDecision({
      queryLocale: 'ko',
      search: '?locale=ko&ref=nav'
    })

    expect(result.redirect).toBe('/ko?ref=nav')
  })

  it('does not redirect for the default locale', () => {
    const result = resolveRootLocaleDecision({
      cookieLocale: 'en'
    })

    expect(result.preferred).toBe('en')
    expect(result.redirect).toBeUndefined()
  })
})

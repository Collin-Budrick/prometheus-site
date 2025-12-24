import { describe, expect, it } from 'bun:test'
import { onRequest } from '../src/routes/_shared/locale/on-request'

describe('onRequest', () => {
  const createEvent = (opts: {
    queryLocale?: string
    cookieLocale?: string
    search?: string
  }) => {
    const cookieJar = opts.cookieLocale ? { locale: opts.cookieLocale } : {}
    const setCalls: Array<{ name: string; value: string }> = []
    const params = new URLSearchParams(opts.search ?? '')
    if (opts.queryLocale) params.set('locale', opts.queryLocale)
    let selectedLocale: string | undefined

    const search = params.toString()

    return {
      event: {
        request: { headers: new Headers() },
        cookie: {
          get: (name: string) => (cookieJar[name] ? { value: cookieJar[name] } : undefined),
          set: (name: string, value: string) => {
            cookieJar[name] = value
            setCalls.push({ name, value })
          }
        },
        query: new URLSearchParams(search),
        locale: (value: string) => {
          selectedLocale = value
        },
        redirect: (status: number, location: string) => ({ status, location }),
        url: new URL(`https://example.com/${search ? `?${search}` : ''}`)
      },
      setCalls,
      get selectedLocale() {
        return selectedLocale
      }
    }
  }

  it('redirects non-default locales to the localized root path', () => {
    const { event } = createEvent({ cookieLocale: 'ko' })

    expect(() => onRequest(event as any)).toThrowError(
      expect.objectContaining({ status: 302, location: '/ko' })
    )
  })

  it('does not redirect for the default locale', () => {
    const eventData = createEvent({ cookieLocale: 'en' })

    expect(() => onRequest(eventData.event as any)).not.toThrow()
    expect(eventData.selectedLocale).toBe('en')
    expect(eventData.setCalls).toEqual([
      expect.objectContaining({
        name: 'locale',
        value: 'en'
      })
    ])
  })

  it('strips the locale query parameter when redirecting', () => {
    const { event } = createEvent({ queryLocale: 'ko', search: 'ref=nav' })

    expect(() => onRequest(event as any)).toThrowError(
      expect.objectContaining({ status: 302, location: '/ko?ref=nav' })
    )
  })
})

import { describe, expect, it, mock } from 'bun:test'

mock.module('@qwik-city-plan', () => ({ default: {} }))
mock.module('@qwik-city-sw-register', () => ({ default: () => {} }))

const { resolveLocaleRedirect } = await import('../src/routes/plugin@locale')
const { resolvePreferredLocaleLoader } = await import('../src/routes/_shared/locale/locale-routing')

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

describe('resolvePreferredLocaleLoader', () => {
  it('persists the chosen locale once while selecting it', () => {
    const setCalls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = []
    let selectedLocale: string | undefined
    let localeCalls = 0

    const result = resolvePreferredLocaleLoader({
      request: new Request('https://example.com/ai'),
      cookie: {
        get: () => ({ value: 'en' }),
        set: (name: string, value: string, opts: Record<string, unknown>) => {
          setCalls.push({ name, value, opts })
        }
      },
      query: new URLSearchParams({ locale: 'ko' }),
      locale: (value: string) => {
        localeCalls += 1
        selectedLocale = value
      }
    } as any)

    expect(result).toBe('ko')
    expect(selectedLocale).toBe('ko')
    expect(localeCalls).toBe(1)
    expect(setCalls).toHaveLength(1)
    expect(setCalls[0]).toEqual(
      expect.objectContaining({
        name: 'locale',
        value: 'ko',
        opts: expect.objectContaining({ path: '/', sameSite: 'lax' })
      })
    )
  })
})

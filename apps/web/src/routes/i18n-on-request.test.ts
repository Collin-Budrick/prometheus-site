import { describe, expect, it } from 'bun:test'
import { createI18nOnRequest } from './i18n-on-request'

describe('createI18nOnRequest', () => {
  it('stores the chosen locale on the root path so navigation keeps the language', () => {
    const handler = createI18nOnRequest(({ queryLocale, cookieLocale }) => queryLocale || cookieLocale || 'en')

    const setCalls: Array<{ name: string; value: string; opts: Record<string, unknown> | undefined }> = []
    const deleteCalls: Array<{ name: string; opts: Record<string, unknown> | undefined }> = []
    let selectedLocale: string | undefined

    handler({
      query: new URLSearchParams({ locale: 'ko' }),
      cookie: {
        get: () => undefined,
        delete: (name: string, opts?: Record<string, unknown>) => {
          deleteCalls.push({ name, opts })
        },
        set: (name: string, value: string, opts?: Record<string, unknown>) => {
          setCalls.push({ name, value, opts })
        }
      },
      headers: new Headers(),
      locale: (value: string) => {
        selectedLocale = value
      }
    } as any)

    expect(selectedLocale).toBe('ko')
    expect(setCalls).toEqual([
      expect.objectContaining({
        name: 'locale',
        value: 'ko',
        opts: expect.objectContaining({ path: '/', sameSite: 'lax' })
      })
    ])
    expect(deleteCalls.some((call) => call.name === 'locale' && call.opts && 'path' in call.opts)).toBe(true)
  })

  it('respects the persisted locale without rewriting the cookie', () => {
    const handler = createI18nOnRequest(({ queryLocale, cookieLocale }) => queryLocale || cookieLocale || 'en')

    const setCalls: Array<{ name: string; value: string; opts: Record<string, unknown> | undefined }> = []
    let selectedLocale: string | undefined

    handler({
      query: new URLSearchParams(),
      cookie: {
        get: (name: string) => (name === 'locale' ? { value: 'ko' } : undefined),
        delete: () => {},
        set: (name: string, value: string, opts?: Record<string, unknown>) => {
          setCalls.push({ name, value, opts })
        }
      },
      headers: new Headers(),
      locale: (value: string) => {
        selectedLocale = value
      }
    } as any)

    expect(selectedLocale).toBe('ko')
    expect(setCalls).toEqual([])
  })
})

import { afterEach, describe, expect, it } from 'bun:test'
import type { RequestEventAction } from '@builder.io/qwik-city'
import { normalizeAuthCallback } from '../src/routes/[locale]/auth-callback'
import { emailRegisterAction } from '../src/routes/[locale]/register/actions'

describe('normalizeAuthCallback', () => {
  it('defaults to the dashboard path with a trailing slash', () => {
    expect(normalizeAuthCallback(undefined)).toBe('/dashboard/')
    expect(normalizeAuthCallback(undefined, 'en')).toBe('/en/dashboard/')
  })

  it('preserves valid callback paths', () => {
    expect(normalizeAuthCallback('/welcome', 'en')).toBe('/welcome')
  })

  it('normalizes root callbacks to the dashboard', () => {
    expect(normalizeAuthCallback('/', 'en')).toBe('/en/dashboard/')
    expect(normalizeAuthCallback('/en', 'en')).toBe('/en/dashboard/')
    expect(normalizeAuthCallback('/en/', 'en')).toBe('/en/dashboard/')
  })

  it('rejects external callbacks', () => {
    expect(normalizeAuthCallback('https://example.com', 'en')).toBe('/en/dashboard/')
    expect(normalizeAuthCallback('//example.com', 'en')).toBe('/en/dashboard/')
  })
})

describe('emailRegisterAction', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const createEvent = (locale?: string) => {
    const headers = new Headers()
    return {
      env: new Map(),
      params: { locale },
      request: new Request('https://example.com/register', { headers: { cookie: 'prefill=true' } }),
      headers,
      fail: (status: number, data: unknown) => ({ status, data }),
      redirect: (status: number, location: string) => ({ status, location })
    } satisfies Partial<RequestEventAction>
  }

  it('redirects to the dashboard when no callback is provided', async () => {
    const fetchCalls: Array<{ url: string; body?: string | null }> = []
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), body: init?.body as string | undefined })
      return new Response('{}', { status: 200, headers: { 'set-cookie': 'session=abc' } })
    }

    const event = createEvent('en')
    await expect(emailRegisterAction({}, event as RequestEventAction)).rejects.toEqual(
      expect.objectContaining({ status: 302, location: '/en/dashboard/' })
    )
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]).toEqual(
      expect.objectContaining({
        url: 'http://localhost:4000/api/auth/sign-up/email'
      })
    )
    expect(fetchCalls[0]?.body && JSON.parse(fetchCalls[0].body)).toEqual(
      expect.objectContaining({
        callbackURL: 'https://example.com/en/dashboard/'
      })
    )
    expect(event.headers.get('set-cookie')).toBe('session=abc')
  })

  it('honors a provided callback path', async () => {
    const fetchCalls: Array<{ body?: string | null }> = []
    globalThis.fetch = async (_url, init) => {
      fetchCalls.push({ body: init?.body as string | undefined })
      return new Response('{}', { status: 200, headers: { 'set-cookie': 'session=def' } })
    }

    const event = createEvent('en')
    await expect(
      emailRegisterAction({ callback: '/welcome' }, event as RequestEventAction)
    ).rejects.toEqual(expect.objectContaining({ status: 302, location: '/welcome' }))
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]?.body && JSON.parse(fetchCalls[0].body)).toEqual(
      expect.objectContaining({
        callbackURL: 'https://example.com/welcome'
      })
    )
    expect(event.headers.get('set-cookie')).toBe('session=def')
  })
})

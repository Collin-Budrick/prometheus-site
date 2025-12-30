import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { RequestEventAction } from '@builder.io/qwik-city'
import { normalizeAuthCallback } from '../src/routes/auth-callback'
import { emailRegisterAction } from '../src/routes/register/actions'

describe('normalizeAuthCallback', () => {
  it('defaults to the dashboard path without a trailing slash', () => {
    expect(normalizeAuthCallback(undefined)).toBe('/dashboard')
  })

  it('preserves valid callback paths', () => {
    expect(normalizeAuthCallback('/welcome')).toBe('/welcome')
  })

  it('normalizes root callbacks to the dashboard', () => {
    expect(normalizeAuthCallback('/')).toBe('/dashboard')
    expect(normalizeAuthCallback('/en')).toBe('/dashboard')
    expect(normalizeAuthCallback('/en/')).toBe('/dashboard')
  })

  it('rejects external callbacks', () => {
    expect(normalizeAuthCallback('https://example.com')).toBe('/dashboard')
    expect(normalizeAuthCallback('//example.com')).toBe('/dashboard')
  })
})

describe('emailRegisterAction', () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.API_URL

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.API_URL = originalApiUrl
  })

  beforeEach(() => {
    process.env.API_URL = 'http://localhost:4000'
  })

  const createEvent = () => {
    const headers = new Headers()
    return {
      env: new Map(),
      params: {},
      request: new Request('https://example.com/register', { headers: { cookie: 'prefill=true' } }),
      headers,
      fail: (status: number, data: unknown) => ({ status, data }),
      redirect: (status: number, location: string) => ({ status, location }),
      html: (status: number, body: string) => ({ status, body })
    } satisfies Partial<RequestEventAction>
  }

  it('returns a redirect page when no callback is provided', async () => {
    const fetchCalls: Array<{ url: string; body?: string | null }> = []
    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), body: init?.body as string | undefined })
      return new Response('{}', { status: 200, headers: { 'set-cookie': 'session=abc' } })
    }

    const event = createEvent()
    await expect(emailRegisterAction({}, event as RequestEventAction)).rejects.toEqual(
      expect.objectContaining({
        status: 200,
        body: expect.stringContaining('url=/dashboard')
      })
    )
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]).toEqual(
      expect.objectContaining({
        url: 'http://localhost:4000/api/auth/sign-up/email'
      })
    )
    expect(fetchCalls[0]?.body && JSON.parse(fetchCalls[0].body)).toEqual(
      expect.objectContaining({
        callbackURL: 'https://example.com/dashboard'
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

    const event = createEvent()
    await expect(
      emailRegisterAction({ callback: '/welcome' }, event as RequestEventAction)
    ).rejects.toEqual(
      expect.objectContaining({
        status: 200,
        body: expect.stringContaining('url=/welcome')
      })
    )
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]?.body && JSON.parse(fetchCalls[0].body)).toEqual(
      expect.objectContaining({
        callbackURL: 'https://example.com/welcome'
      })
    )
    expect(event.headers.get('set-cookie')).toBe('session=def')
  })
})

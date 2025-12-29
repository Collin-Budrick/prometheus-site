import type { RequestEventBase } from '@builder.io/qwik-city'
import { afterEach, describe, expect, it } from 'bun:test'

import { buildAuthHeaders, forwardAuthCookies, resolveWebSocketUrl } from './session'

const createEvent = () => {
  const forwarded: string[] = []
  const event = {
    headers: {
      append: (_name: string, value: string) => {
        forwarded.push(value)
      }
    }
  } as unknown as RequestEventBase

  return { event, forwarded }
}

describe('forwardAuthCookies', () => {
  it('forwards all cookies when the header string includes Expires commas', () => {
    const response = new Response('ok', {
      headers: {
        'set-cookie':
          'session=abc; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT, refresh=def; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT'
      }
    })
    const { event, forwarded } = createEvent()

    forwardAuthCookies(response, event)

    expect(forwarded).toEqual([
      'session=abc; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
      'refresh=def; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT'
    ])
  })

  it('uses getSetCookie when it is available on the response headers', () => {
    const cookies = [
      'session=abc; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
      'refresh=def; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT'
    ]
    const response = {
      headers: {
        getSetCookie: () => cookies
      }
    } as unknown as Response
    const { event, forwarded } = createEvent()

    forwardAuthCookies(response, event)

    expect(forwarded).toEqual(cookies)
  })

  it('stores cookies on the event when the cookie API is available', () => {
    const response = new Response('ok', {
      headers: {
        'set-cookie': 'session=abc; Path=/; HttpOnly; SameSite=Lax'
      }
    })
    const forwarded: string[] = []
    const stored: Array<{ name: string; value: string; options: Record<string, unknown> }> = []
    const event = {
      headers: {
        append: (_name: string, value: string) => {
          forwarded.push(value)
        }
      },
      cookie: {
        set: (name: string, value: string, options: Record<string, unknown>) => {
          stored.push({ name, value, options })
        }
      }
    } as unknown as RequestEventBase

    forwardAuthCookies(response, event)

    expect(forwarded).toEqual([])
    expect(stored).toEqual([
      {
        name: 'session',
        value: 'abc',
        options: {
          httpOnly: true,
          path: '/',
          sameSite: 'lax'
        }
      }
    ])
  })
})

describe('buildAuthHeaders', () => {
  it('forwards host, proto, and cookie headers', () => {
    const event = {
      request: new Request('http://app.test/path', {
        headers: {
          cookie: 'session=abc',
          host: 'app.test',
          'x-forwarded-host': 'edge.test',
          'x-forwarded-proto': 'https'
        }
      })
    } as unknown as RequestEventBase

    const headers = buildAuthHeaders(event)

    expect(headers.get('cookie')).toBe('session=abc')
    expect(headers.get('x-forwarded-host')).toBe('edge.test')
    expect(headers.get('x-forwarded-proto')).toBe('https')
    expect(headers.get('origin')).toBe('https://edge.test')
  })

  it('falls back to request url when forwarded proto is missing', () => {
    const event = {
      request: new Request('https://example.test/hello', {
        headers: {
          host: 'example.test'
        }
      })
    } as unknown as RequestEventBase

    const headers = buildAuthHeaders(event)

    expect(headers.get('x-forwarded-proto')).toBe('https')
    expect(headers.get('x-forwarded-host')).toBe('example.test')
    expect(headers.get('origin')).toBe('https://example.test')
  })
})

describe('resolveWebSocketUrl', () => {
  const originalApiUrl = process.env.API_URL
  const originalWindow = typeof window === 'undefined' ? undefined : window

  afterEach(() => {
    if (typeof originalApiUrl === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.API_URL
    } else {
      process.env.API_URL = originalApiUrl
    }
    if (typeof originalWindow === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as Record<string, unknown>).window
    } else {
      globalThis.window = originalWindow
    }
  })

  it('prefers API_URL and preserves path prefixes', () => {
    process.env.API_URL = 'http://api.example.com/prefix'

    const url = resolveWebSocketUrl('/api/ws')

    expect(url).toBe('ws://api.example.com/prefix/api/ws')
  })

  it('falls back to the page origin when API_URL is not set', () => {
    process.env.API_URL = ''
    const locationStub = { origin: 'https://site.test' } as Location
    globalThis.window = { location: locationStub } as Window & typeof globalThis

    const url = resolveWebSocketUrl('/api/ws')

    expect(url).toBe('wss://site.test/api/ws')
  })
})

import { afterEach, describe, expect, it } from 'bun:test'

import { resolveSpacetimeAuthMode, signOutSpacetimeAuth, startSpacetimeAuthLogin } from './spacetime-auth'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow
    })
  }
})

describe('resolveSpacetimeAuthMode', () => {
  it('uses hosted auth when an auth base path is configured', () => {
    expect(
      resolveSpacetimeAuthMode({
        authBasePath: '/api/auth',
        dev: true
      })
    ).toBe('hosted')
  })

  it('uses the local development fallback when hosted auth config is missing in dev', () => {
    expect(
      resolveSpacetimeAuthMode({
        authBasePath: undefined,
        dev: true
      })
    ).toBe('dev-session')
  })

  it('keeps auth interactive on .dev hosts when hosted auth config is missing', () => {
    expect(
      resolveSpacetimeAuthMode({
        authBasePath: undefined,
        dev: false,
        hostname: 'prometheus.dev'
      })
    ).toBe('dev-session')
  })

  it('keeps auth interactive on development hosts when runtime config is missing', () => {
    expect(
      resolveSpacetimeAuthMode({
        authBasePath: undefined,
        dev: false,
        featureEnabled: true,
        hostname: 'prometheus.dev'
      })
    ).toBe('dev-session')
  })

  it('treats missing hosted auth config as disabled outside development', () => {
    expect(
      resolveSpacetimeAuthMode({
        authBasePath: undefined,
        dev: false,
        hostname: 'prometheus.prod'
      })
    ).toBe('disabled')
  })

  it('keeps hosted auth enabled on non-development hosts when the auth base path is configured', () => {
    expect(
      resolveSpacetimeAuthMode({
        authBasePath: '/api/auth',
        dev: false,
        hostname: 'prometheus.prod'
      })
    ).toBe('hosted')
  })
})

describe('signOutSpacetimeAuth', () => {
  it('posts JSON to Better Auth sign-out before clearing the site session bridge', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    }) as typeof fetch

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          origin: 'https://prometheus.prod'
        },
        localStorage: {
          getItem: () => null,
          removeItem: () => undefined,
          setItem: () => undefined
        },
        sessionStorage: {
          getItem: () => null,
          removeItem: () => undefined,
          setItem: () => undefined
        }
      }
    })

    await expect(signOutSpacetimeAuth()).resolves.toBe('https://prometheus.prod/')
    expect(requests).toHaveLength(2)
    expect(String(requests[0]?.input)).toBe('https://prometheus.prod/api/auth/sign-out')
    expect(requests[0]?.init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: '{}',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      }
    })
    expect(String(requests[1]?.input)).toBe('https://prometheus.prod/auth/logout')
  })
})

describe('startSpacetimeAuthLogin', () => {
  it('supports Facebook sign-in through Better Auth social redirects', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const assignCalls: string[] = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return new Response(JSON.stringify({ redirect: true, url: 'https://facebook.example/oauth' }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    }) as typeof fetch

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          origin: 'https://prometheus.prod',
          hostname: 'prometheus.prod',
          assign: (value: string) => {
            assignCalls.push(value)
          }
        }
      }
    })

    await expect(startSpacetimeAuthLogin('facebook', { next: '/profile' })).resolves.toBeUndefined()
    expect(requests).toHaveLength(1)
    expect(String(requests[0]?.input)).toBe('https://prometheus.prod/api/auth/sign-in/social')
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      provider: 'facebook'
    })
    expect(assignCalls).toEqual(['https://facebook.example/oauth'])
  })
})

import { afterEach, describe, expect, it } from 'bun:test'

import {
  getHostedSocialProviderLabel,
  isHostedPasskeySupported,
  isHostedSocialProvider,
  resolveSpacetimeAuthMode,
  signOutSpacetimeAuth,
  signInHostedPasskey,
  startSpacetimeAuthLogin
} from './spacetime-auth'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const originalNavigator = globalThis.navigator
const originalPublicKeyCredential = globalThis.PublicKeyCredential

const encodeBase64Url = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const createStorage = () => {
  const state = new Map<string, string>()
  return {
    getItem: (key: string) => state.get(key) ?? null,
    removeItem: (key: string) => {
      state.delete(key)
    },
    setItem: (key: string, value: string) => {
      state.set(key, value)
    }
  }
}

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
  if (originalNavigator === undefined) {
    Reflect.deleteProperty(globalThis, 'navigator')
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator
    })
  }
  if (originalPublicKeyCredential === undefined) {
    Reflect.deleteProperty(globalThis, 'PublicKeyCredential')
  } else {
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: originalPublicKeyCredential
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
  it('supports Twitter sign-in through Better Auth social redirects', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const assignCalls: string[] = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return new Response(JSON.stringify({ redirect: true, url: 'https://twitter.example/oauth' }), {
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

    await expect(startSpacetimeAuthLogin('twitter', { next: '/profile' })).resolves.toBeUndefined()
    expect(requests).toHaveLength(1)
    expect(String(requests[0]?.input)).toBe('https://prometheus.prod/api/auth/sign-in/social')
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      provider: 'twitter'
    })
    expect(assignCalls).toEqual(['https://twitter.example/oauth'])
  })
})

describe('hosted social providers', () => {
  it('recognizes twitter and resolves the X label', () => {
    expect(isHostedSocialProvider('twitter')).toBe(true)
    expect(getHostedSocialProviderLabel('twitter')).toBe('Twitter (X)')
  })
})

describe('passkeys', () => {
  it('recognizes browser support and completes hosted passkey sign-in', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const tokenPayload = encodeBase64Url(
      JSON.stringify({
        email: 'passkey@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        name: 'Passkey User',
        sub: 'user-1'
      })
    )

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      const url = String(input)

      if (url.endsWith('/api/auth/passkey/generate-authenticate-options')) {
        return new Response(
          JSON.stringify({
            allowCredentials: [],
            challenge: encodeBase64Url('challenge')
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        )
      }

      if (url.endsWith('/api/auth/passkey/verify-authentication')) {
        return new Response(JSON.stringify({ user: { id: 'user-1' } }), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      }

      if (url.endsWith('/api/auth/get-session')) {
        return new Response(
          JSON.stringify({
            session: { id: 'session-1' },
            user: { email: 'passkey@example.com', id: 'user-1', name: 'Passkey User' }
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        )
      }

      if (url.endsWith('/api/auth/token')) {
        return new Response(JSON.stringify({ token: `header.${tokenPayload}.signature` }), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      }

      if (url.endsWith('/auth/session/sync')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      }

      throw new Error(`Unexpected request: ${url}`)
    }) as typeof fetch

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          origin: 'https://prometheus.prod',
          hostname: 'prometheus.prod'
        },
        localStorage: createStorage(),
        sessionStorage: createStorage()
      }
    })

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        credentials: {
          create: async () => null,
          get: async () =>
            ({
              id: 'credential-1',
              rawId: Uint8Array.from([1, 2, 3]).buffer,
              type: 'public-key',
              response: {
                authenticatorData: Uint8Array.from([4, 5, 6]).buffer,
                clientDataJSON: Uint8Array.from([7, 8, 9]).buffer,
                signature: Uint8Array.from([10, 11, 12]).buffer,
                userHandle: null
              },
              getClientExtensionResults: () => ({})
            }) satisfies Partial<PublicKeyCredential>
        }
      }
    })

    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: class PublicKeyCredentialMock {}
    })

    expect(isHostedPasskeySupported()).toBe(true)
    await expect(signInHostedPasskey()).resolves.toMatchObject({
      user: {
        email: 'passkey@example.com',
        id: 'user-1'
      }
    })

    expect(requests).toHaveLength(5)
    expect(String(requests[0]?.input)).toBe('https://prometheus.prod/api/auth/passkey/generate-authenticate-options')
    expect(String(requests[1]?.input)).toBe('https://prometheus.prod/api/auth/passkey/verify-authentication')
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
      response: {
        id: 'credential-1',
        type: 'public-key'
      }
    })
  })
})

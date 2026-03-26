import { afterEach, describe, expect, it } from 'bun:test'

import type { AuthSessionState } from './auth-session'
import {
  clearClientAuthSessionCache,
  didAuthSessionChange,
  hasClientSiteSessionCookie,
  loadClientAuthSession
} from './auth-session-client'

const anonymousSession: AuthSessionState = { status: 'anonymous' }

const authenticatedSession = (id: string): AuthSessionState => ({
  status: 'authenticated',
  user: { id }
})

const originalFetch = globalThis.fetch
const originalDocument = globalThis.document
const originalWindow = globalThis.window

afterEach(() => {
  clearClientAuthSessionCache()
  globalThis.fetch = originalFetch
  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, 'document')
  } else {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument
    })
  }
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow
    })
  }
})

describe('didAuthSessionChange', () => {
  it('detects auth status changes across bfcache restores', () => {
    expect(didAuthSessionChange(anonymousSession, authenticatedSession('user-1'))).toBe(true)
    expect(didAuthSessionChange(authenticatedSession('user-1'), anonymousSession)).toBe(true)
  })

  it('detects authenticated user swaps', () => {
    expect(didAuthSessionChange(authenticatedSession('user-1'), authenticatedSession('user-2'))).toBe(true)
  })

  it('treats the same authenticated user as unchanged', () => {
    expect(didAuthSessionChange(authenticatedSession('user-1'), authenticatedSession('user-1'))).toBe(false)
    expect(didAuthSessionChange(anonymousSession, anonymousSession)).toBe(false)
  })
})

describe('hasClientSiteSessionCookie', () => {
  it('detects the mirrored site session cookie without false positives', () => {
    expect(hasClientSiteSessionCookie('theme=dark; session=abc123; lang=en')).toBe(true)
    expect(hasClientSiteSessionCookie('session=abc123')).toBe(true)
    expect(hasClientSiteSessionCookie('spacetimedb_session=abc123; theme=dark')).toBe(false)
    expect(hasClientSiteSessionCookie('')).toBe(false)
  })
})

describe('loadClientAuthSession', () => {
  it('revalidates against the server when the site session cookie is HttpOnly', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        cookie: 'theme=dark; lang=en'
      }
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          origin: 'https://prometheus.dev'
        }
      }
    })

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          user: {
            id: 'dev-local-user',
            email: 'dev@example.com',
            name: 'Dev User'
          },
          session: {
            userId: 'dev-local-user'
          }
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )) as typeof fetch

    await expect(loadClientAuthSession({ force: true })).resolves.toEqual({
      status: 'authenticated',
      user: {
        id: 'dev-local-user',
        email: 'dev@example.com',
        name: 'Dev User',
        image: undefined
      }
    })
  })
})

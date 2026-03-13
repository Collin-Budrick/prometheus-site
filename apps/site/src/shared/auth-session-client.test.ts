import { describe, expect, it } from 'bun:test'

import type { AuthSessionState } from './auth-session'
import { didAuthSessionChange, hasClientSiteSessionCookie } from './auth-session-client'

const anonymousSession: AuthSessionState = { status: 'anonymous' }

const authenticatedSession = (id: string): AuthSessionState => ({
  status: 'authenticated',
  user: { id }
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

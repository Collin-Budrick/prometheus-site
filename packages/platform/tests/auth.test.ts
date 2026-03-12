import { beforeEach, describe, expect, it } from 'bun:test'
import { apiUrl, ensureApiReady, resetTestState } from './setup'

await ensureApiReady()

beforeEach(() => {
  resetTestState()
})

describe('session bridge endpoints', () => {
  it('creates a mirrored session from a synced ID token', async () => {
    const sync = await fetch(`${apiUrl}/auth/session/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idToken: 'mock-id-token'
      }),
      redirect: 'manual'
    })

    expect(sync.status).toBe(200)
    const cookie = sync.headers.get('set-cookie')
    expect(cookie).toContain('session=')

    const session = await fetch(`${apiUrl}/auth/session`, {
      headers: { cookie: cookie ?? '' }
    })

    expect(session.status).toBe(200)
    const payload = await session.json()
    expect(payload.session.userId).toBe('user-1')
    expect(payload.user.id).toBe('user-1')
  })

  it('rejects session sync requests without an ID token', async () => {
    const sync = await fetch(`${apiUrl}/auth/session/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(sync.status).toBe(400)
    const payload = await sync.json()
    expect(payload.error).toContain('ID token')
  })

  it('rejects session lookups without a valid cookie', async () => {
    const session = await fetch(`${apiUrl}/auth/session`)

    expect(session.status).toBe(401)
    const payload = await session.json()
    expect(payload.message).toContain('No active session')
  })

  it('clears the mirrored session on logout', async () => {
    const sync = await fetch(`${apiUrl}/auth/session/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idToken: 'mock-id-token'
      }),
      redirect: 'manual'
    })

    const cookie = sync.headers.get('set-cookie') ?? ''
    const logout = await fetch(`${apiUrl}/auth/logout`, {
      method: 'POST',
      headers: { cookie },
      redirect: 'manual'
    })

    expect(logout.status).toBe(200)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

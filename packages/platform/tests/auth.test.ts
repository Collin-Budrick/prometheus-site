import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import {
  apiUrl,
  authSessionsData,
  authUsersData,
  ensureApiReady,
  oauthCallbacks,
  oauthStarts,
  passkeyEvents,
  resetTestState
} from './setup'

beforeAll(async () => {
  await ensureApiReady()
})

beforeEach(() => {
  resetTestState()
})

describe('email session endpoints', () => {
  it('creates a session on signup and allows session verification', async () => {
    const signup = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'New User',
        email: 'new@example.com',
        password: 'hunter2'
      }),
      redirect: 'manual'
    })

    expect(signup.status).toBe(200)
    const cookie = signup.headers.get('set-cookie')
    expect(cookie).toContain('session=')
    expect(authUsersData.find((user) => user.email === 'new@example.com')).toBeDefined()

    const session = await fetch(`${apiUrl}/api/auth/session`, {
      headers: { cookie: cookie ?? '' }
    })

    expect(session.status).toBe(200)
    const payload = await session.json()
    expect(payload.session.userId).toBeDefined()
    expect(authSessionsData.length).toBe(1)
  })

  it('signs in existing users and returns refreshed cookies', async () => {
    const login = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@example.com',
        password: 'password123',
        rememberMe: true
      }),
      redirect: 'manual'
    })

    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')
    expect(cookie).toContain('session=')
    expect(authSessionsData.at(-1)?.userId).toBe('user-1')
  })

  it('rejects session lookups without a valid cookie', async () => {
    const session = await fetch(`${apiUrl}/api/auth/session`)

    expect(session.status).toBe(401)
    const payload = await session.json()
    expect(payload.message).toContain('No active session')
  })
})

describe('passkey endpoints', () => {
  it('serves registration options and records verification payloads', async () => {
    const options = await fetch(`${apiUrl}/api/auth/passkey/generate-register-options`)
    expect(options.status).toBe(200)
    const data = await options.json()
    expect(data.challenge).toBe('register-challenge')

    const verify = await fetch(`${apiUrl}/api/auth/passkey/verify-registration`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response: { id: 'cred-1' } })
    })

    expect(verify.status).toBe(200)
    expect(verify.headers.get('set-cookie')).toContain('session=')
    expect(passkeyEvents).toEqual([
      { type: 'registration', payload: { response: { id: 'cred-1' } } }
    ])
  })

  it('provides authentication options and completes verification', async () => {
    const options = await fetch(`${apiUrl}/api/auth/passkey/generate-authenticate-options`)
    expect(options.status).toBe(200)
    const data = await options.json()
    expect(data.challenge).toBe('authenticate-challenge')
    expect(Array.isArray(data.allowCredentials)).toBe(true)

    const verify = await fetch(`${apiUrl}/api/auth/passkey/verify-authentication`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response: { id: 'cred-auth' } })
    })

    expect(verify.status).toBe(200)
    expect(passkeyEvents.at(-1)).toEqual({
      type: 'authentication',
      payload: { response: { id: 'cred-auth' } }
    })
  })
})

describe('oauth endpoints', () => {
  it('redirects to provider start and completes callback with a session', async () => {
    const start = await fetch(`${apiUrl}/api/auth/oauth/github/start`, { redirect: 'manual' })

    expect(start.status).toBe(302)
    expect(oauthStarts).toEqual([
      { provider: 'github', redirect: '/api/auth/oauth/github/callback?code=mock-code&state=mock-state' }
    ])
    const redirect = start.headers.get('location')
    expect(redirect).toContain('/callback')

    const callback = await fetch(`${apiUrl}${redirect}`, { redirect: 'manual' })
    expect(callback.status).toBe(302)
    expect(callback.headers.get('set-cookie')).toContain('session=')
    expect(callback.headers.get('location')).toBe('/')
    expect(oauthCallbacks).toEqual([
      { provider: 'github', code: 'mock-code', state: 'mock-state' }
    ])
  })
})

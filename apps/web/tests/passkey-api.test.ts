import type { RequestEventBase } from '@builder.io/qwik-city'
import { describe, expect, it } from 'bun:test'

import {
  fetchPasskeyAuthenticateOptions,
  fetchPasskeyAuthenticationVerification
} from '../src/routes/[locale]/login/passkey-api'

const createEvent = () => {
  const request = new Request('https://app.local/login', {
    headers: new Headers({
      cookie: 'session=web',
      'x-forwarded-host': 'app.local',
      'x-forwarded-proto': 'https'
    })
  })

  return {
    request,
    headers: new Headers(),
    env: new Map([['API_URL', 'http://api.test:9999']])
  } as RequestEventBase
}

describe('passkey api forwarding', () => {
  it('uses the configured API origin for passkey endpoints', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body?: string }> = []
    const event = createEvent()

    const mockFetch: typeof fetch = async (url, init) => {
      calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers)),
        body: init?.body ? String(init.body) : undefined
      })

      return new Response('{}', {
        status: 200,
        headers: { 'set-cookie': 'session=api; Path=/; HttpOnly' }
      })
    }

    await fetchPasskeyAuthenticateOptions(event, mockFetch)
    await fetchPasskeyAuthenticationVerification(event, { response: { id: 'cred' } }, mockFetch)

    expect(calls.map((call) => call.url)).toEqual([
      'http://api.test:9999/api/auth/passkey/generate-authenticate-options',
      'http://api.test:9999/api/auth/passkey/verify-authentication'
    ])
    expect(calls[0].headers.cookie).toBe('session=web')
    expect(calls[0].headers['x-forwarded-host']).toBe('app.local')
    expect(calls[0].headers['x-forwarded-proto']).toBe('https')
    expect(event.headers.get('set-cookie')).toContain('session=api')
  })
})

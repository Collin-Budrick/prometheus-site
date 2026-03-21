import { afterEach, describe, expect, it } from 'bun:test'

import { loadAuthSession } from './auth-session'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('loadAuthSession', () => {
  it('treats a null auth payload as anonymous', async () => {
    globalThis.fetch = (async () =>
      new Response('null', {
        headers: {
          'content-type': 'application/json'
        }
      })) as unknown as typeof fetch

    await expect(loadAuthSession(new Request('https://prometheus.prod/'))).resolves.toEqual({
      status: 'anonymous'
    })
  })

  it('treats payloads without a user id as anonymous', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          session: {},
          user: {
            name: 'Anonymous shell'
          }
        }),
        {
          headers: {
            'content-type': 'application/json'
          }
        }
      )) as unknown as typeof fetch

    await expect(loadAuthSession(new Request('https://prometheus.prod/'))).resolves.toEqual({
      status: 'anonymous'
    })
  })
})

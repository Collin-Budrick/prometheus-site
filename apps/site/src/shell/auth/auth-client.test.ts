import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { clearClientAuthSessionCache, loadClientAuthSession } from './auth-client'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window

describe('loadClientAuthSession', () => {
  beforeEach(() => {
    clearClientAuthSessionCache()
    globalThis.window = {
      location: {
        origin: 'https://prometheus.prod'
      }
    } as never
  })

  afterEach(() => {
    clearClientAuthSessionCache()
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  })

  it('treats a null auth payload as anonymous', async () => {
    globalThis.fetch = (async () =>
      new Response('null', {
        headers: {
          'content-type': 'application/json'
        }
      })) as unknown as typeof fetch

    await expect(loadClientAuthSession()).resolves.toEqual({ status: 'anonymous' })
  })

  it('falls back to anonymous when the auth request throws', async () => {
    globalThis.fetch = (async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch

    await expect(loadClientAuthSession()).resolves.toEqual({ status: 'anonymous' })
  })
})

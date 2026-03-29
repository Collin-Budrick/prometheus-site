import { afterEach, describe, expect, it } from 'bun:test'

import { attemptBootstrapSession } from './auth-bootstrap'

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

describe('attemptBootstrapSession', () => {
  it('skips the bootstrap bridge when the public verification key is not configured', async () => {
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      return new Response(null, { status: 500 })
    }) as typeof fetch

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => null,
          removeItem: () => undefined,
          setItem: () => undefined
        }
      }
    })

    await expect(attemptBootstrapSession('https://prometheus.prod')).resolves.toBe(false)
    expect(fetchCalls).toBe(0)
  })
})

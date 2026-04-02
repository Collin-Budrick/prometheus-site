import { afterEach, describe, expect, it } from 'bun:test'

import type { FragmentBootstrapWindow } from './bootstrap-cache'
import {
  buildFragmentBootstrapHref,
  primeFragmentBootstrapBytes,
  readPrimedFragmentBootstrapBytes,
  resetFragmentBootstrapStateForTests
} from './bootstrap-cache'

const createBootstrapWindow = () =>
  ({
    location: {
      origin: 'https://prometheus.prod'
    }
  }) as FragmentBootstrapWindow

describe('fragment bootstrap cache', () => {
  let testWindow: FragmentBootstrapWindow | null = null

  afterEach(() => {
    resetFragmentBootstrapStateForTests(testWindow)
    testWindow = null
  })

  it('dedupes bootstrap href ids and lang', () => {
    expect(
      buildFragmentBootstrapHref({
        ids: ['alpha', 'beta', 'alpha', '  beta  '],
        lang: 'en',
        apiBase: '/api'
      })
    ).toBe('/api/fragments/bootstrap?protocol=2&ids=alpha%2Cbeta&lang=en')
  })

  it('primes and reuses bootstrap bytes by resolved href', async () => {
    testWindow = createBootstrapWindow()
    let fetchCalls = 0

    const first = primeFragmentBootstrapBytes({
      href: '/api/fragments/bootstrap?protocol=2&ids=alpha',
      win: testWindow,
      fetcher: async () => {
        fetchCalls += 1
        return new Response(new Uint8Array([1, 2, 3, 4]))
      }
    })
    const second = primeFragmentBootstrapBytes({
      href: 'https://prometheus.prod/api/fragments/bootstrap?protocol=2&ids=alpha',
      win: testWindow,
      fetcher: async () => {
        fetchCalls += 1
        return new Response(new Uint8Array([9, 9, 9, 9]))
      }
    })

    await expect(first).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
    await expect(second).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
    await expect(
      readPrimedFragmentBootstrapBytes({
        href: '/api/fragments/bootstrap?protocol=2&ids=alpha',
        win: testWindow
      })
    ).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(fetchCalls).toBe(1)
  })
})

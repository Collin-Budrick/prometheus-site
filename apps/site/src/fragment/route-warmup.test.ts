import { describe, expect, it } from 'bun:test'

import { createRouteFragmentWarmupManager, __private__ } from './route-warmup'

const CHAT_SEARCH_ID = 'fragment://page/chat/search@v1'
const CHAT_ACTIVITY_ID = 'fragment://page/chat/activity@v1'

const createCache = () => {
  const entries = new Map<string, any>()
  return {
    cache: {
      get(path: string, lang?: string) {
        return entries.get(`${lang ?? 'default'}|${path}`)
      },
      set(path: string, lang: string | undefined, entry: any) {
        entries.set(`${lang ?? 'default'}|${path}`, entry)
      }
    },
    read(path: string, lang?: string) {
      return entries.get(`${lang ?? 'default'}|${path}`)
    }
  }
}

describe('route fragment warmup manager', () => {
  it('seeds the plan cache and worker bootstrap from a fetch-based warmup', async () => {
    const { cache, read } = createCache()
    const primed = new Map<string, Promise<Uint8Array>>()
    const runtimePrimes: Array<{ href: string | undefined; bytes: number[] }> = []
    const plan = {
      path: '/chat',
      createdAt: 1,
      earlyHints: [{ href: '/build/chat.css', as: 'style' }],
      fetchGroups: [[CHAT_SEARCH_ID], [CHAT_ACTIVITY_ID]],
      fragments: [
        {
          id: CHAT_SEARCH_ID,
          critical: true,
          layout: { column: 'span 12' },
          cache: { updatedAt: 101 }
        },
        {
          id: CHAT_ACTIVITY_ID,
          critical: false,
          layout: { column: 'span 12' },
          cache: { updatedAt: 202 }
        }
      ]
    } as any

    const manager = createRouteFragmentWarmupManager({
      origin: 'https://prometheus.prod',
      cache: cache as never,
      loadPlan: async () => plan,
      buildBootstrapHref: ({ ids, lang }) => `/api/fragments/bootstrap?ids=${ids.join(',')}&lang=${lang ?? ''}`,
      primeBootstrap: ({ href }) => {
        const bytes = Promise.resolve(new Uint8Array([3, 1, 4]))
        primed.set(href, bytes)
        return bytes
      },
      readPrimedBootstrap: ({ href }) => primed.get(href) ?? null,
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID,
            cacheUpdatedAt: 999
          }
        }) as never,
      primeRuntimeBootstrap: async (bytes, href) => {
        runtimePrimes.push({ href, bytes: Array.from(bytes) })
      }
    })

    await manager.warmRoute('https://prometheus.prod/chat?lang=en')

    const warmed = read('/chat', 'en')
    expect(warmed.plan).toBe(plan)
    expect(warmed.initialFragments?.[CHAT_SEARCH_ID]).toMatchObject({
      id: CHAT_SEARCH_ID,
      cacheUpdatedAt: 101
    })
    expect(warmed.initialFragments?.[CHAT_ACTIVITY_ID]).toBeUndefined()
    expect(warmed.earlyHints).toEqual(
      expect.arrayContaining([
        { href: '/build/chat.css', as: 'style' },
        expect.objectContaining({ as: 'style' })
      ])
    )
    expect(runtimePrimes).toEqual([
      {
        href: `/api/fragments/bootstrap?ids=${CHAT_SEARCH_ID}&lang=en`,
        bytes: [3, 1, 4]
      }
    ])
  })

  it('marks the compatibility handled flag and skips duplicate bootstrap priming once cached', async () => {
    const { cache } = createCache()
    const pageWindow: Record<string, boolean> = {}
    let primeCalls = 0
    const bytes = Promise.resolve(new Uint8Array([7, 7, 7]))
    const plan = {
      path: '/chat',
      createdAt: 1,
      fetchGroups: [[CHAT_SEARCH_ID]],
      fragments: [
        {
          id: CHAT_SEARCH_ID,
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as any
    const primed = new Map<string, Promise<Uint8Array>>()
    const manager = createRouteFragmentWarmupManager({
      origin: 'https://prometheus.prod',
      cache: cache as never,
      pageWindow: pageWindow as never,
      loadPlan: async () => plan,
      buildBootstrapHref: ({ ids }) => `/api/fragments/bootstrap?ids=${ids.join(',')}`,
      primeBootstrap: ({ href }) => {
        primeCalls += 1
        primed.set(href, bytes)
        return bytes
      },
      readPrimedBootstrap: ({ href }) => primed.get(href) ?? null,
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID
          }
        }) as never,
      primeRuntimeBootstrap: async () => {}
    })

    await manager.warmRoute('https://prometheus.prod/chat')
    await manager.warmRoute('https://prometheus.prod/chat')

    expect(primeCalls).toBe(1)
    expect(__private__.resolveInitialWarmupAttempted(pageWindow as never)).toBe(true)
    expect(pageWindow[__private__.INITIAL_FRAGMENT_WARMUP_HANDLED_KEY]).toBe(true)
  })
})

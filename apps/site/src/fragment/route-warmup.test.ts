import { describe, expect, it } from 'bun:test'

import { PUBLIC_FRAGMENT_CACHE_SCOPE, buildUserFragmentCacheScope } from './cache-scope'
import { createRouteFragmentWarmupManager, __private__ } from './route-warmup'

const CHAT_SEARCH_ID = 'fragment://page/chat/search@v1'
const CHAT_ACTIVITY_ID = 'fragment://page/chat/activity@v1'

const createCache = () => {
  const entries = new Map<string, any>()
  return {
    cache: {
      get(path: string, lang?: string, options?: { scopeKey?: string | null }) {
        return entries.get(`${options?.scopeKey ?? PUBLIC_FRAGMENT_CACHE_SCOPE}|${lang ?? 'default'}|${path}`)
      },
      set(path: string, lang: string | undefined, entry: any, options?: { scopeKey?: string | null }) {
        entries.set(`${options?.scopeKey ?? PUBLIC_FRAGMENT_CACHE_SCOPE}|${lang ?? 'default'}|${path}`, entry)
      },
      delete(path: string, lang?: string, options?: { scopeKey?: string | null }) {
        entries.delete(`${options?.scopeKey ?? PUBLIC_FRAGMENT_CACHE_SCOPE}|${lang ?? 'default'}|${path}`)
      }
    },
    read(path: string, lang?: string, scopeKey: string = PUBLIC_FRAGMENT_CACHE_SCOPE) {
      return entries.get(`${scopeKey}|${lang ?? 'default'}|${path}`)
    }
  }
}

describe('route fragment warmup manager', () => {
  it('seeds the plan cache and worker bootstrap from a fetch-based warmup', async () => {
    const { cache, read } = createCache()
    const runtimePrimes: Array<{ href: string | undefined; bytes: number[] }> = []
    const seededPayloads: Array<{ scopeKey: string; path: string; lang: string; ids: string[] }> = []
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
      primeBootstrap: () => {
        const bytes = Promise.resolve(new Uint8Array([3, 1, 4]))
        return bytes
      },
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID,
            cacheUpdatedAt: 999
          }
        }) as never,
      payloadCache: {
        listPayloadIds: async () => [],
        seedPayloads: async (scopeKey, path, lang, payloads) => {
          seededPayloads.push({ scopeKey, path, lang, ids: payloads.map((payload) => payload.id) })
        }
      },
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
    expect(seededPayloads).toEqual([
      {
        scopeKey: PUBLIC_FRAGMENT_CACHE_SCOPE,
        path: '/chat',
        lang: 'en',
        ids: [CHAT_SEARCH_ID]
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
    const manager = createRouteFragmentWarmupManager({
      origin: 'https://prometheus.prod',
      cache: cache as never,
      pageWindow: pageWindow as never,
      loadPlan: async () => plan,
      buildBootstrapHref: ({ ids }) => `/api/fragments/bootstrap?ids=${ids.join(',')}`,
      primeBootstrap: () => {
        primeCalls += 1
        return bytes
      },
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID
          }
        }) as never,
      payloadCache: {
        listPayloadIds: async () => [],
        seedPayloads: async () => {}
      },
      primeRuntimeBootstrap: async () => {}
    })

    await manager.warmRoute('https://prometheus.prod/chat')
    await manager.warmRoute('https://prometheus.prod/chat')

    expect(primeCalls).toBe(1)
    expect(__private__.resolveInitialWarmupAttempted(pageWindow as never)).toBe(true)
    expect(pageWindow[__private__.INITIAL_FRAGMENT_WARMUP_HANDLED_KEY]).toBe(true)
  })

  it('refreshes cached route payload ids for the active user scope on force', async () => {
    const { cache, read } = createCache()
    const userScope = buildUserFragmentCacheScope('user-123')
    const requestedIds: string[][] = []
    const plan = {
      path: '/chat',
      createdAt: 1,
      fragments: [
        {
          id: CHAT_SEARCH_ID,
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as any

    const manager = createRouteFragmentWarmupManager({
      origin: 'https://prometheus.prod',
      cache: cache as never,
      resolveUserCacheKey: () => 'user-123',
      loadPlan: async () => plan,
      buildBootstrapHref: ({ ids }) => {
        requestedIds.push([...ids])
        return `/api/fragments/bootstrap?ids=${ids.join(',')}`
      },
      primeBootstrap: async () => new Uint8Array([1, 2, 3]),
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID
          },
          [CHAT_ACTIVITY_ID]: {
            id: CHAT_ACTIVITY_ID
          }
        }) as never,
      payloadCache: {
        listPayloadIds: async () => [CHAT_ACTIVITY_ID],
        seedPayloads: async () => {}
      },
      primeRuntimeBootstrap: async () => {}
    })

    await manager.warmRoute('https://prometheus.prod/chat?lang=en', { force: true })

    expect(requestedIds).toEqual([[CHAT_SEARCH_ID, CHAT_ACTIVITY_ID]])
    expect(read('/chat', 'en', userScope)?.initialFragments?.[CHAT_ACTIVITY_ID]).toMatchObject({
      id: CHAT_ACTIVITY_ID
    })
  })

  it('normalizes trailing-slash warm routes before caching payloads', async () => {
    const { cache, read } = createCache()
    const seededPayloads: Array<{ scopeKey: string; path: string; lang: string; ids: string[] }> = []
    const plan = {
      path: '/chat',
      createdAt: 1,
      fragments: [
        {
          id: CHAT_SEARCH_ID,
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as any

    const manager = createRouteFragmentWarmupManager({
      origin: 'https://prometheus.prod',
      cache: cache as never,
      loadPlan: async () => plan,
      buildBootstrapHref: ({ ids, lang }) => `/api/fragments/bootstrap?ids=${ids.join(',')}&lang=${lang ?? ''}`,
      primeBootstrap: async () => new Uint8Array([4, 5, 6]),
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID
          }
        }) as never,
      payloadCache: {
        listPayloadIds: async () => [],
        seedPayloads: async (scopeKey, path, lang, payloads) => {
          seededPayloads.push({ scopeKey, path, lang, ids: payloads.map((payload) => payload.id) })
        }
      },
      primeRuntimeBootstrap: async () => {}
    })

    await manager.warmRoute('https://prometheus.prod/chat/?lang=en')

    expect(read('/chat', 'en')?.initialFragments?.[CHAT_SEARCH_ID]).toMatchObject({
      id: CHAT_SEARCH_ID
    })
    expect(seededPayloads).toEqual([
      {
        scopeKey: PUBLIC_FRAGMENT_CACHE_SCOPE,
        path: '/chat',
        lang: 'en',
        ids: [CHAT_SEARCH_ID]
      }
    ])
  })

  it('falls back to direct fragment fetches when bootstrap bytes omit requested ids', async () => {
    const { cache, read } = createCache()
    const seededPayloads: Array<{ scopeKey: string; path: string; lang: string; ids: string[] }> = []
    const batchRequests: Array<{ ids: string[]; lang?: string; refresh?: boolean }> = []
    const plan = {
      path: '/chat',
      createdAt: 1,
      fragments: [
        {
          id: CHAT_SEARCH_ID,
          critical: true,
          layout: { column: 'span 12' },
          cache: { updatedAt: 101 }
        },
        {
          id: CHAT_ACTIVITY_ID,
          critical: true,
          layout: { column: 'span 12' },
          cache: { updatedAt: 202 }
        }
      ]
    } as any

    const manager = createRouteFragmentWarmupManager({
      origin: 'https://prometheus.prod',
      cache: cache as never,
      loadPlan: async () => plan,
      loadFragments: async (entries, options) => {
        batchRequests.push({
          ids: entries.map((entry) => entry.id),
          lang: options?.lang,
          refresh: options?.refresh
        })
        return {
          [CHAT_ACTIVITY_ID]: {
            id: CHAT_ACTIVITY_ID
          }
        } as never
      },
      buildBootstrapHref: ({ ids, lang }) => `/api/fragments/bootstrap?ids=${ids.join(',')}&lang=${lang ?? ''}`,
      primeBootstrap: async () => new Uint8Array([1, 2, 3]),
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID
          }
        }) as never,
      payloadCache: {
        listPayloadIds: async () => [],
        seedPayloads: async (scopeKey, path, lang, payloads) => {
          seededPayloads.push({ scopeKey, path, lang, ids: payloads.map((payload) => payload.id) })
        }
      },
      primeRuntimeBootstrap: async () => {}
    })

    await manager.warmRoute('https://prometheus.prod/chat?lang=en')

    expect(batchRequests).toEqual([
      {
        ids: [CHAT_ACTIVITY_ID],
        lang: 'en',
        refresh: undefined
      }
    ])
    expect(seededPayloads).toEqual([
      {
        scopeKey: PUBLIC_FRAGMENT_CACHE_SCOPE,
        path: '/chat',
        lang: 'en',
        ids: [CHAT_SEARCH_ID, CHAT_ACTIVITY_ID]
      }
    ])
    expect(read('/chat', 'en')?.initialFragments?.[CHAT_ACTIVITY_ID]).toMatchObject({
      id: CHAT_ACTIVITY_ID,
      cacheUpdatedAt: 202
    })
  })

  it('skips bootstrap refetch when the scoped payload cache already contains the warm fragment ids', async () => {
    const { cache, read } = createCache()
    let primeCalls = 0
    const plan = {
      path: '/chat',
      createdAt: 1,
      fragments: [
        {
          id: CHAT_SEARCH_ID,
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as any

    const manager = createRouteFragmentWarmupManager({
      origin: 'https://prometheus.prod',
      cache: cache as never,
      loadPlan: async () => plan,
      buildBootstrapHref: ({ ids }) => `/api/fragments/bootstrap?ids=${ids.join(',')}`,
      primeBootstrap: async () => {
        primeCalls += 1
        return new Uint8Array([1, 2, 3])
      },
      decodeBootstrap: () =>
        ({
          [CHAT_SEARCH_ID]: {
            id: CHAT_SEARCH_ID
          }
        }) as never,
      payloadCache: {
        listPayloadIds: async () => [CHAT_SEARCH_ID],
        seedPayloads: async () => {}
      },
      primeRuntimeBootstrap: async () => {}
    })

    await manager.warmRoute('https://prometheus.prod/chat?lang=en')

    expect(primeCalls).toBe(0)
    expect(read('/chat', 'en')).toMatchObject({
      plan
    })
  })
})

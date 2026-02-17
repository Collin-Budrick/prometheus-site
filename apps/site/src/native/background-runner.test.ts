import { afterEach, describe, expect, it } from 'bun:test'
import { encodeFragmentPayloadFromTree, type FragmentDefinition } from '@core/fragments'
import { clearFragmentPlanCache, fragmentPlanCache } from '../fragment/plan-cache'

type BackgroundRunnerModule = typeof import('./background-runner')

let backgroundRunnerModulePromise: Promise<BackgroundRunnerModule> | null = null

const loadBackgroundRunnerModule = async () => {
  ;(globalThis as unknown as { __PUBLIC_APP_CONFIG__?: unknown }).__PUBLIC_APP_CONFIG__ = {
    apiBase: '',
    fragmentVisibilityMargin: '60% 0px',
    fragmentVisibilityThreshold: 0.4
  }
  if (!backgroundRunnerModulePromise) {
    backgroundRunnerModulePromise = import('./background-runner')
  }
  return backgroundRunnerModulePromise
}

afterEach(async () => {
  if (backgroundRunnerModulePromise) {
    const mod = await backgroundRunnerModulePromise
    mod.resetBackgroundRunnerForTests()
  }
  clearFragmentPlanCache()
})

describe('background runner bridge', () => {
  it('returns safe fallbacks outside native runtime', async () => {
    const mod = await loadBackgroundRunnerModule()
    mod.setBackgroundRunnerNativeRuntimeOverrideForTests(false)
    const configured = await mod.configureBackgroundPrefetch({
      origin: 'https://prometheus.dev',
      lang: 'en',
      isAuthenticated: false
    })
    expect(configured).toBe(false)
    expect(await mod.getBackgroundStoreQueue()).toBeNull()
  })

  it('normalizes queue operations through dispatch events', async () => {
    const mod = await loadBackgroundRunnerModule()
    mod.setBackgroundRunnerNativeRuntimeOverrideForTests(true)
    let queue: Array<{ type: 'consume' | 'restore'; id: number; amount?: number; queuedAt: string }> = []
    mod.setBackgroundRunnerDispatchOverrideForTests(async (event, details) => {
      if (event === 'store-cart-queue:set') {
        queue = Array.isArray(details.queue) ? (details.queue as typeof queue) : []
        return { size: queue.length }
      }
      if (event === 'store-cart-queue:get') {
        return { queue }
      }
      if (event === 'store-cart-config:set') {
        return { ok: true }
      }
      if (event === 'store-cart-sync') {
        const processed = queue.length
        queue = []
        return { processed, remaining: 0 }
      }
      return null
    })

    const saved = await mod.setBackgroundStoreQueue([{ type: 'consume', id: 5, queuedAt: '2026-01-01T00:00:00.000Z' }])
    expect(saved).toBe(true)
    expect(await mod.getBackgroundStoreQueue()).toHaveLength(1)
    const syncResult = await mod.syncBackgroundStoreQueue({ origin: 'https://prometheus.dev', reason: 'test' })
    expect(syncResult).toEqual({ processed: 1, remaining: 0 })
  })

  it('hydrates fragment plan cache from exported prefetch payloads', async () => {
    const mod = await loadBackgroundRunnerModule()
    mod.setBackgroundRunnerNativeRuntimeOverrideForTests(true)
    const definition: FragmentDefinition = {
      id: 'home-frag',
      runtime: 'edge',
      ttl: 30,
      staleTtl: 60,
      tags: [],
      head: [],
      css: '',
      render: async () => ({ type: 'element', tag: 'div', children: [{ type: 'text', text: 'hello' }] })
    }
    const encoded = encodeFragmentPayloadFromTree(definition, {
      type: 'element',
      tag: 'div',
      children: [{ type: 'text', text: 'hello' }]
    })
    const encodedBase64 = Buffer.from(encoded).toString('base64')
    const planPayload = {
      path: '/',
      createdAt: Date.now(),
      fragments: [{ id: 'home-frag', critical: true, layout: { column: 'span 12' } }],
      initialFragments: {
        'home-frag': encodedBase64
      }
    }

    mod.setBackgroundRunnerDispatchOverrideForTests(async (event, _details) => {
      if (event !== 'prefetch:export') return null
      return {
        entries: [
          {
            path: '/',
            lang: 'en',
            fetchedAt: Date.now(),
            etag: 'W/"test"',
            payloadText: JSON.stringify(planPayload)
          },
          {
            path: '/broken',
            lang: 'en',
            fetchedAt: Date.now(),
            payloadText: '{not-json'
          }
        ]
      }
    })

    const hydrated = await mod.hydrateBackgroundPrefetchCache()
    expect(hydrated.hydrated).toBe(1)
    expect(hydrated.skipped).toBe(1)

    const entry = fragmentPlanCache.get('/', 'en')
    expect(entry?.plan.path).toBe('/')
    expect(entry?.initialFragments?.['home-frag']?.id).toBe('home-frag')
  })

  it('builds auth-aware prefetch config payloads', async () => {
    const mod = await loadBackgroundRunnerModule()
    const publicPayload = mod.buildBackgroundPrefetchConfigPayload({
      origin: 'https://prometheus.dev',
      lang: 'en',
      isAuthenticated: false,
      publicRoutes: ['/', '/store'],
      authRoutes: ['/chat'],
      fragmentRoutes: ['/']
    })
    expect(publicPayload?.activeRoutes).toEqual(['/', '/store'])

    const authPayload = mod.buildBackgroundPrefetchConfigPayload({
      origin: 'https://prometheus.dev',
      lang: 'en',
      isAuthenticated: true,
      publicRoutes: ['/', '/store'],
      authRoutes: ['/chat'],
      fragmentRoutes: ['/']
    })
    expect(authPayload?.activeRoutes).toEqual(['/', '/store', '/chat'])
  })
})

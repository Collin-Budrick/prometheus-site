import { describe, expect, it } from 'bun:test'

import type { FragmentPayload } from '../../fragment/types'
import { createStaticFragmentRouteData } from './static-fragment-model'
import {
  collectMissingStaticFragmentRouteIds,
  hasCompleteStaticFragmentRouteSnapshot,
  loadRouteFragmentSnapshotPayloads,
  mergeFragmentPayloadSources,
  orderRouteSnapshotPayloads,
  restoreRouteFragmentSnapshotFromCaches,
  restoreStaticFragmentRouteData
} from './route-snapshot'

const createPayload = (id: string, cacheUpdatedAt?: number): FragmentPayload => ({
  id,
  html: `<div>${id}</div>`,
  css: '',
  head: [],
  data: null,
  meta: {
    cacheKey: `${id}:cache`
  },
  ...(typeof cacheUpdatedAt === 'number' ? { cacheUpdatedAt } : {})
})

describe('route snapshot helpers', () => {
  it('prefers newer cached payloads when merging route snapshot sources', () => {
    const initialPayload = createPayload('fragment://page/store/stream@v1', 10)
    const warmedPayload = createPayload('fragment://page/store/stream@v1', 20)
    const deferredPayload = createPayload('fragment://page/store/cart@v1', 15)

    expect(
      mergeFragmentPayloadSources(
        [initialPayload],
        {
          [warmedPayload.id]: warmedPayload,
          [deferredPayload.id]: deferredPayload
        }
      )
    ).toEqual({
      [warmedPayload.id]: warmedPayload,
      [deferredPayload.id]: deferredPayload
    })
  })

  it('restores runtime initial fragments in route order and reports full coverage', () => {
    const heroPayload = createPayload('fragment://page/store/hero@v1', 11)
    const cartPayload = createPayload('fragment://page/store/cart@v1', 22)
    const routeData = createStaticFragmentRouteData({
      path: '/store',
      lang: 'en',
      fragmentOrder: [heroPayload.id, cartPayload.id]
    })

    const restored = restoreStaticFragmentRouteData(
      routeData,
      mergeFragmentPayloadSources({
        [cartPayload.id]: cartPayload,
        [heroPayload.id]: heroPayload
      })
    )

    expect(orderRouteSnapshotPayloads(restored.fragmentOrder, mergeFragmentPayloadSources(restored.runtimeInitialFragments))).toEqual([
      heroPayload,
      cartPayload
    ])
    expect(restored.runtimeInitialFragments).toEqual([heroPayload, cartPayload])
    expect(restored.fragmentVersions).toEqual({
      [heroPayload.id]: 11,
      [cartPayload.id]: 22
    })
    expect(collectMissingStaticFragmentRouteIds(restored)).toEqual([])
    expect(hasCompleteStaticFragmentRouteSnapshot(restored)).toBe(true)
  })

  it('keeps missing ids visible until they have been restored from cache', () => {
    const heroPayload = createPayload('fragment://page/store/hero@v1', 11)
    const cartId = 'fragment://page/store/cart@v1'
    const routeData = createStaticFragmentRouteData({
      path: '/store',
      lang: 'en',
      fragmentOrder: [heroPayload.id, cartId],
      runtimeInitialFragments: [heroPayload]
    })

    expect(collectMissingStaticFragmentRouteIds(routeData)).toEqual([cartId])
    expect(hasCompleteStaticFragmentRouteSnapshot(routeData)).toBe(false)
  })

  it('hydrates cached payloads from plan and persistent cache sources together', async () => {
    const heroPayload = createPayload('fragment://page/store/hero@v1', 11)
    const cartPayload = createPayload('fragment://page/store/cart@v1', 22)
    const payloadCache = {
      hydrate: async () => undefined,
      getPayloadsForRoute: async () => [cartPayload]
    }

    const mergedPayloads = await loadRouteFragmentSnapshotPayloads({
      scopeKey: 'public',
      path: '/store',
      lang: 'en',
      runtimeInitialFragments: [heroPayload],
      planInitialFragments: {
        [heroPayload.id]: heroPayload
      },
      payloadCache
    })

    expect(mergedPayloads).toEqual({
      [heroPayload.id]: heroPayload,
      [cartPayload.id]: cartPayload
    })
  })

  it('restores route data from cached payload stores in route order', async () => {
    const heroPayload = createPayload('fragment://page/store/hero@v1', 11)
    const cartPayload = createPayload('fragment://page/store/cart@v1', 22)
    const routeData = createStaticFragmentRouteData({
      path: '/store',
      lang: 'en',
      fragmentOrder: [heroPayload.id, cartPayload.id],
      runtimeInitialFragments: [heroPayload]
    })

    const restored = await restoreRouteFragmentSnapshotFromCaches({
      scopeKey: 'public',
      path: '/store',
      lang: 'en',
      routeData,
      planInitialFragments: {
        [heroPayload.id]: heroPayload
      },
      payloadCache: {
        hydrate: async () => undefined,
        getPayloadsForRoute: async () => [cartPayload]
      }
    })

    expect(restored.routeData.runtimeInitialFragments).toEqual([heroPayload, cartPayload])
    expect(restored.routeData.fragmentVersions).toEqual({
      [heroPayload.id]: 11,
      [cartPayload.id]: 22
    })
    expect(restored.mergedPayloads).toEqual({
      [heroPayload.id]: heroPayload,
      [cartPayload.id]: cartPayload
    })
  })
})

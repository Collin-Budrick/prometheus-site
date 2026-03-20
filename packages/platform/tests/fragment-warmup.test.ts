import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { defaultFragmentLang } from '@core/fragment/i18n'
import { createFragmentService } from '@core/fragment/service'
import { registerSiteFragmentBundles } from '@site/fragment/definitions/register'
import { buildFragmentPlanCacheKey } from '@platform/cache-helpers'
import { createFragmentUpdateBroadcaster } from '@platform/server/fragment-updates'
import {
  createFragmentStore,
  warmFragmentRouteArtifacts
} from '@platform/server/fragments'
import {
  cacheKeysWritten,
  publishedMessages,
  resetTestState,
  testValkey
} from './setup'

const cacheClient = {
  client: testValkey,
  isReady: () => true,
  connect: async () => {},
  disconnect: async () => {}
}

beforeAll(async () => {
  registerSiteFragmentBundles()
})

beforeEach(() => {
  resetTestState()
})

describe('fragment artifact warmup', () => {
  it('reuses warmed route artifacts across fresh services without rerendering', async () => {
    let firstRenderCount = 0
    const firstStore = createFragmentStore(cacheClient)
    const firstService = createFragmentService({
      store: firstStore,
      onFragmentRendered: () => {
        firstRenderCount += 1
      }
    })

    const firstWarm = await warmFragmentRouteArtifacts({
      path: '/',
      lang: defaultFragmentLang,
      cache: cacheClient,
      service: firstService,
      store: firstStore
    })

    expect(firstWarm.fragmentIds.length).toBeGreaterThan(0)
    expect(firstRenderCount).toBeGreaterThan(0)
    expect(cacheKeysWritten).toContain(buildFragmentPlanCacheKey('/', defaultFragmentLang))
    expect(cacheKeysWritten.some((key) => key.includes('fragment://page/home/manifest@v1::en:1:br'))).toBe(true)

    let secondRenderCount = 0
    const secondStore = createFragmentStore(cacheClient)
    const secondService = createFragmentService({
      store: secondStore,
      onFragmentRendered: () => {
        secondRenderCount += 1
      }
    })

    await warmFragmentRouteArtifacts({
      path: '/',
      lang: defaultFragmentLang,
      cache: cacheClient,
      service: secondService,
      store: secondStore
    })

    expect(secondRenderCount).toBe(0)
  })
})

describe('fragment update broadcaster', () => {
  it('fans out fragment updates across broadcasters sharing Garnet', async () => {
    const broadcasterA = createFragmentUpdateBroadcaster(cacheClient)
    const broadcasterB = createFragmentUpdateBroadcaster(cacheClient)
    const received: Array<{ type: string; id?: string; lang?: string; updatedAt?: number }> = []

    broadcasterB.subscribe((event) => {
      received.push(event)
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    broadcasterA.notifyFragment({
      type: 'fragment',
      id: 'fragment://page/home/manifest@v1',
      lang: 'en',
      updatedAt: 42
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(publishedMessages.length).toBe(1)
    expect(received).toContainEqual({
      type: 'fragment',
      id: 'fragment://page/home/manifest@v1',
      lang: 'en',
      updatedAt: 42
    })
  })
})

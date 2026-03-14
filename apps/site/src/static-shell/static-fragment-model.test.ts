import { describe, expect, it } from 'bun:test'
import { h, t } from '@core/fragment/tree'
import {
  buildFragmentHeightPlanSignature
} from '@prometheus/ui/fragment-height'
import { buildStaticFragmentRouteModel } from './static-fragment-model'

describe('static-fragment-model', () => {
  it('uses the shared cookie-backed reserved heights and exposes route height metadata', () => {
    const plan = {
      path: '/store',
      createdAt: 1,
      fragments: [
        {
          id: 'fragment://page/store/stream@v5',
          critical: true,
          layout: { column: 'span 12', size: 'small', minHeight: 579, heightHint: { desktop: 633 } }
        },
        {
          id: 'fragment://page/store/cart@v1',
          critical: true,
          layout: { column: 'span 12', size: 'small', minHeight: 440, heightHint: { desktop: 440 } }
        }
      ]
    } as const
    const planSignature = buildFragmentHeightPlanSignature(plan.fragments.map((entry) => entry.id))
    const cookieHeader = `prom_frag_h=${encodeURIComponent(`v1|%2Fstore|en|desktop|${planSignature}|700,460`)}`

    const model = buildStaticFragmentRouteModel({
      plan: plan as never,
      fragments: {
        'fragment://page/store/stream@v5': {
          id: 'fragment://page/store/stream@v5',
          tree: h('section', null, [h('p', null, [t('stream')])]),
          head: [],
          css: '',
          meta: {
            cacheKey: 'stream:1',
            ttl: 30,
            staleTtl: 60,
            tags: [],
            runtime: 'edge'
          },
          cacheUpdatedAt: 1
        },
        'fragment://page/store/cart@v1': {
          id: 'fragment://page/store/cart@v1',
          tree: h('section', null, [h('p', null, [t('cart')])]),
          head: [],
          css: '',
          meta: {
            cacheKey: 'cart:1',
            ttl: 30,
            staleTtl: 60,
            tags: [],
            runtime: 'edge'
          },
          cacheUpdatedAt: 2
        }
      },
      lang: 'en',
      cookieHeader,
      viewportHint: 'desktop'
    })

    expect(model.entries.map((entry) => entry.reservedHeight)).toEqual([700, 460])
    expect(model.routeData.fragmentOrder).toEqual(plan.fragments.map((entry) => entry.id))
    expect(model.routeData.planSignature).toBe(planSignature)
  })
})

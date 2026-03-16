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

  it('renders static fragment replacements from the provided fragment copy', () => {
    const plan = {
      path: '/store',
      createdAt: 1,
      fragments: [
        {
          id: 'fragment://page/store/stream@v5',
          critical: true,
          layout: { column: 'span 12' }
        },
        {
          id: 'fragment://page/store/create@v1',
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as const

    const model = buildStaticFragmentRouteModel({
      plan: plan as never,
      fragments: {
        'fragment://page/store/stream@v5': {
          id: 'fragment://page/store/stream@v5',
          tree: h('store-stream', { class: 'store-stream' }, []),
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
        'fragment://page/store/create@v1': {
          id: 'fragment://page/store/create@v1',
          html: '<store-create class="store-create"></store-create>',
          tree: h('store-create', { class: 'store-create' }, []),
          head: [],
          css: '',
          meta: {
            cacheKey: 'create:1',
            ttl: 30,
            staleTtl: 60,
            tags: [],
            runtime: 'edge'
          },
          cacheUpdatedAt: 2
        }
      },
      fragmentCopy: {
        'Search the store...': 'ストアを検索...',
        'Live snapshot': 'ライブスナップショット',
        'Live catalog': 'ライブカタログ',
        'SpaceTimeDB snapshot': 'SpaceTimeDB スナップショット',
        'Catalog is empty.': 'カタログは空です。',
        'items': '件',
        'Digital product': 'デジタル商品',
        'Add item': 'アイテム追加',
        'Item name': 'アイテム名',
        'Price': '価格',
        'Quantity': '数量'
      },
      lang: 'ja',
      storeSeed: {
        stream: { items: [], sort: 'id', dir: 'asc' },
        cart: { items: [], queuedCount: 0 }
      }
    })

    expect(model.entries[0]?.html).toContain('ライブカタログ')
    expect(model.entries[0]?.html).toContain('SpaceTimeDB スナップショット')
    expect(model.entries[0]?.html).toContain('カタログは空です。')
    expect(model.entries[1]?.html).toContain('デジタル商品')
    expect(model.entries[1]?.html).toContain('アイテム追加')
  })

  it('renders custom fragment tags from tree payloads even when raw html is present', () => {
    const plan = {
      path: '/store',
      createdAt: 1,
      fragments: [
        {
          id: 'fragment://page/store/create@v1',
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as const

    const model = buildStaticFragmentRouteModel({
      plan: plan as never,
      fragments: {
        'fragment://page/store/create@v1': {
          id: 'fragment://page/store/create@v1',
          html: '<store-create class="store-create"></store-create>',
          tree: h('store-create', { class: 'store-create' }, []),
          head: [],
          css: '',
          meta: {
            cacheKey: 'create:2',
            ttl: 30,
            staleTtl: 60,
            tags: [],
            runtime: 'edge'
          },
          cacheUpdatedAt: 2
        }
      },
      lang: 'en',
      storeSeed: {
        stream: { items: [], sort: 'id', dir: 'asc' },
        cart: { items: [], queuedCount: 0 }
      }
    })

    expect(model.entries[0]?.html).toContain('store-create-submit')
    expect(model.entries[0]?.html).toContain('Digital product')
    expect(model.entries[0]?.html).not.toContain('<store-create')
  })

  it('does not let plan initialHtml bypass static replacement markup', () => {
    const plan = {
      path: '/store',
      createdAt: 1,
      fragments: [
        {
          id: 'fragment://page/store/cart@v1',
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as const

    const model = buildStaticFragmentRouteModel({
      plan: plan as never,
      fragments: {
        'fragment://page/store/cart@v1': {
          id: 'fragment://page/store/cart@v1',
          html: '<store-cart class="store-cart"></store-cart>',
          tree: h('store-cart', { class: 'store-cart' }, []),
          head: [],
          css: '',
          meta: {
            cacheKey: 'cart:2',
            ttl: 30,
            staleTtl: 60,
            tags: [],
            runtime: 'edge'
          },
          cacheUpdatedAt: 3
        }
      },
      initialHtml: {
        'fragment://page/store/cart@v1': '<store-cart class="store-cart"></store-cart>'
      },
      lang: 'en',
      storeSeed: {
        stream: { items: [], sort: 'id', dir: 'asc' },
        cart: { items: [], queuedCount: 0 }
      }
    })

    expect(model.entries[0]?.html).toContain('store-cart-total')
    expect(model.entries[0]?.html).toContain('Cart is empty.')
    expect(model.entries[0]?.html).not.toContain('<store-cart')
  })

  it('renders store stream replacements without seeded fragment copy', () => {
    const plan = {
      path: '/store',
      createdAt: 1,
      fragments: [
        {
          id: 'fragment://page/store/stream@v5',
          critical: true,
          layout: { column: 'span 12' }
        }
      ]
    } as const

    const model = buildStaticFragmentRouteModel({
      plan: plan as never,
      fragments: {
        'fragment://page/store/stream@v5': {
          id: 'fragment://page/store/stream@v5',
          tree: h('store-stream', { class: 'store-stream' }, []),
          head: [],
          css: '',
          meta: {
            cacheKey: 'stream:2',
            ttl: 30,
            staleTtl: 60,
            tags: [],
            runtime: 'edge'
          },
          cacheUpdatedAt: 1
        }
      },
      lang: 'en',
      storeSeed: {
        stream: {
          items: [{ id: 2, name: 'Item 2', price: 6, quantity: 2 }],
          sort: 'id',
          dir: 'asc'
        },
        cart: { items: [], queuedCount: 0 }
      }
    })

    expect(model.entries[0]?.html).toContain('Search the store...')
    expect(model.entries[0]?.html).toContain('Item 2')
    expect(model.entries[0]?.html).toContain('Add to cart')
  })
})

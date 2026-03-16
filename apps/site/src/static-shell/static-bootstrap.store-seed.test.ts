import { describe, expect, it } from 'bun:test'
import { mergeStaticStoreSeedForSnapshot } from './static-bootstrap'
import type { StaticFragmentRouteData } from './fragment-static-data'

const createRouteData = (
  overrides: Partial<StaticFragmentRouteData> = {}
): StaticFragmentRouteData => ({
  lang: 'en',
  path: '/store',
  snapshotKey: '/store',
  authPolicy: 'public',
  bootstrapMode: 'fragment-static',
  fragmentOrder: ['fragment://page/store/stream@v5'],
  planSignature: 'store-plan',
  versionSignature: 'store-version',
  runtimePlanEntries: [],
  fragmentVersions: {},
  storeSeed: {
    stream: {
      items: [{ id: 2, name: 'Item 2', price: 6, quantity: 2 }],
      sort: 'id',
      dir: 'asc'
    },
    cart: {
      items: [{ id: 2, name: 'Item 2', price: 6, qty: 1 }],
      queuedCount: 0
    }
  },
  contactInvitesSeed: null,
  ...overrides
})

describe('mergeStaticStoreSeedForSnapshot', () => {
  it('preserves the current store seed when the replacement store snapshot is empty', () => {
    const current = createRouteData()
    const next = createRouteData({
      lang: 'ja',
      storeSeed: {
        stream: { items: [], sort: 'id', dir: 'asc' },
        cart: { items: [], queuedCount: 0 }
      }
    })

    const merged = mergeStaticStoreSeedForSnapshot(current, next)

    expect(merged?.lang).toBe('ja')
    expect(merged?.storeSeed).toEqual(current.storeSeed)
    expect(merged?.storeSeed).not.toBe(current.storeSeed)
  })

  it('does not override a replacement store snapshot that already has store data', () => {
    const current = createRouteData()
    const next = createRouteData({
      lang: 'ja',
      storeSeed: {
        stream: {
          items: [{ id: 4, name: 'Item 4', price: 12, quantity: 4 }],
          sort: 'id',
          dir: 'asc'
        },
        cart: { items: [], queuedCount: 0 }
      }
    })

    expect(mergeStaticStoreSeedForSnapshot(current, next)).toEqual(next)
  })

  it('ignores non-store routes', () => {
    const current = createRouteData({ path: '/store' })
    const next = createRouteData({
      path: '/lab',
      snapshotKey: '/lab',
      storeSeed: {
        stream: { items: [], sort: 'id', dir: 'asc' },
        cart: { items: [], queuedCount: 0 }
      }
    })

    expect(mergeStaticStoreSeedForSnapshot(current, next)).toEqual(next)
  })
})

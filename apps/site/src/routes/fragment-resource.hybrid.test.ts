import { beforeEach, describe, expect, it, mock } from 'bun:test'

const storeStreamId = 'fragment://page/store/stream@v5'
const storeCartId = 'fragment://page/store/cart@v1'
const storeCreateId = 'fragment://page/store/create@v1'

const plan = {
  path: '/store',
  createdAt: 1,
  fragments: [
    {
      id: storeStreamId,
      critical: true,
      layout: { column: 'span 12' as const },
      bootMode: 'binary' as const
    },
    {
      id: storeCartId,
      critical: true,
      layout: { column: 'span 12' as const },
      bootMode: 'binary' as const
    },
    {
      id: storeCreateId,
      critical: false,
      layout: { column: 'span 12' as const },
      bootMode: 'stream' as const
    }
  ]
}

const buildFragment = (id: string, html: string) => ({
  id,
  html,
  tree: {
    type: 'element' as const,
    tag: 'div',
    attrs: {},
    children: []
  }
})

const initialFragments = {
  [storeStreamId]: buildFragment(storeStreamId, '<div>stream</div>'),
  [storeCartId]: buildFragment(storeCartId, '<div>cart</div>')
}

const loadFragmentsCalls: string[][] = []

mock.module('@core/fragment/server', () => ({
  loadFragmentPlan: async () => ({
    plan,
    initialFragments
  }),
  loadFragments: async (ids: string[]) => {
    loadFragmentsCalls.push([...ids])
    return ids.reduce<Record<string, ReturnType<typeof buildFragment>>>((acc, id) => {
      acc[id] = buildFragment(id, `<${id === storeCreateId ? 'store-create' : 'div'}></${id === storeCreateId ? 'store-create' : 'div'}>`)
      return acc
    }, {})
  }
}))

const { loadHybridFragmentResource } = await import('./fragment-resource')
const { fragmentPlanCache } = await import('../fragment/plan-cache')

beforeEach(() => {
  loadFragmentsCalls.length = 0
  fragmentPlanCache.clear?.()
})

describe('loadHybridFragmentResource', () => {
  it('loads non-critical stream fragments when full static route content is requested', async () => {
    const resource = await loadHybridFragmentResource(
      '/store',
      { apiBase: 'https://example.com/api' },
      'en',
      new Request('https://example.com/store?lang=en'),
      { includeAllFragments: true }
    )

    expect(loadFragmentsCalls).toEqual([[storeCreateId]])
    expect(resource.fragments[storeCreateId]?.html).toContain('store-create')
  })

  it('keeps the default initial selection when full static route content is not requested', async () => {
    const resource = await loadHybridFragmentResource(
      '/store',
      { apiBase: 'https://example.com/api' },
      'en',
      new Request('https://example.com/store?lang=en')
    )

    expect(loadFragmentsCalls).toEqual([])
    expect(resource.fragments[storeCreateId]).toBeUndefined()
  })
})

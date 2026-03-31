import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { h } from '@core/fragment/tree'
import {
  READY_STAGGER_DELAY_VAR,
  READY_STAGGER_STATE_ATTR,
  resetReadyStaggerBatchesForTests
} from '@prometheus/ui/ready-stagger'
import { seedLanguageResources, resetLanguageClientCacheForTests } from '../../lang/client'
import { patchStaticFragmentCard } from './fragment-stream'
import type { StaticFragmentRouteData } from './fragment-static-data'

const TEST_FRAGMENT_ID = 'fragment://test/store/create@v1'

class MockStyle {
  height = ''
  private props = new Map<string, string>()

  setProperty(name: string, value: string) {
    this.props.set(name, value)
  }

  getPropertyValue(name: string) {
    return this.props.get(name) ?? ''
  }

  removeProperty(name: string) {
    this.props.delete(name)
  }
}

class MockBodyElement {
  innerHTML = ''
}

class MockCardElement {
  dataset: Record<string, string>
  isConnected = true
  style = new MockStyle()
  scrollHeight = 489
  private attrs: Map<string, string>

  constructor(
    private readonly body: MockBodyElement,
    options: {
      version?: number
      readyStaggerState?: 'queued' | 'done'
      revealPhase?: 'holding' | 'queued' | 'visible'
      fragmentReady?: boolean
      fragmentStage?: string
    } = {}
  ) {
    this.dataset = {
      fragmentId: TEST_FRAGMENT_ID
    }
    this.attrs = new Map<string, string>([
      ['data-fragment-id', TEST_FRAGMENT_ID],
      ['data-static-fragment-card', 'true'],
      ['data-static-fragment-body', TEST_FRAGMENT_ID],
      ['data-fragment-height-hint', '489'],
      ['data-fragment-version', `${options.version ?? 1}`]
    ])
    if (options.readyStaggerState) {
      this.attrs.set(READY_STAGGER_STATE_ATTR, options.readyStaggerState)
    }
    if (options.revealPhase) {
      this.dataset.revealPhase = options.revealPhase
    }
    if (options.fragmentReady) {
      this.dataset.fragmentReady = 'true'
    }
    if (options.fragmentStage) {
      this.dataset.fragmentStage = options.fragmentStage
    }
  }

  querySelector(selector: string) {
    if (selector.includes('[data-static-fragment-body]')) {
      return this.body
    }
    return null
  }

  querySelectorAll(_selector: string) {
    return []
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
    if (name.startsWith('data-')) {
      const datasetKey = name
        .slice(5)
        .replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
      this.dataset[datasetKey] = value
    }
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }

  getBoundingClientRect() {
    return {
      width: 640,
      height: 489,
      top: 0,
      left: 0,
      right: 640,
      bottom: 489
    }
  }

  dispatchEvent(_event: Event) {
    return true
  }
}

class MockDocument {
  cookie = ''

  constructor(private readonly card: MockCardElement) {}

  querySelector(selector: string) {
    if (selector.includes('[data-static-fragment-card]')) {
      return this.card
    }
    return null
  }

  querySelectorAll(_selector: string) {
    return []
  }
}

const createStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    }
  }
}

const flushAsyncWork = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}

let originalDocument: typeof globalThis.document
let originalWindow: typeof globalThis.window
let originalCustomEvent: typeof globalThis.CustomEvent
let originalHTMLElement: typeof globalThis.HTMLElement
let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame

describe('patchStaticFragmentCard', () => {
  beforeEach(() => {
    originalDocument = globalThis.document
    originalWindow = globalThis.window
    originalCustomEvent = globalThis.CustomEvent
    originalHTMLElement = globalThis.HTMLElement
    originalRequestAnimationFrame = globalThis.requestAnimationFrame
  })

  afterEach(() => {
    resetReadyStaggerBatchesForTests()
    resetLanguageClientCacheForTests()
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    globalThis.CustomEvent = originalCustomEvent
    globalThis.HTMLElement = originalHTMLElement
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  })

  it('uses translated fragment copy and whole-card reveal gating when patching static store fragments', async () => {
    const body = new MockBodyElement()
    const card = new MockCardElement(body)
    const doc = new MockDocument(card)

    globalThis.document = doc as unknown as Document
    globalThis.window = {
      innerWidth: 1280,
      innerHeight: 800,
      localStorage: createStorage()
    } as unknown as Window & typeof globalThis
    globalThis.HTMLElement = MockCardElement as unknown as typeof HTMLElement
    globalThis.CustomEvent = class MockCustomEvent<T = unknown> extends Event {
      detail: T

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type)
        this.detail = init?.detail as T
      }
    } as unknown as typeof CustomEvent
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof requestAnimationFrame

    seedLanguageResources('ja', {
      fragments: {
        'Digital product': 'デジタル商品',
        'Add item': 'アイテム追加',
        'Item name': 'アイテム名',
        Price: '価格',
        Quantity: '数量'
      }
    })

    const routeData: StaticFragmentRouteData = {
      lang: 'ja',
      path: '/store',
      snapshotKey: '/store',
      authPolicy: 'public',
      bootstrapMode: 'fragment-static',
      fragmentOrder: [TEST_FRAGMENT_ID],
      planSignature: 'store-plan',
      versionSignature: 'store-version',
      runtimePlanEntries: [],
      fragmentVersions: {
        [TEST_FRAGMENT_ID]: 2
      },
      storeSeed: {
        stream: { items: [], sort: 'id', dir: 'asc' },
        cart: { items: [], queuedCount: 0 }
      },
      contactInvitesSeed: null
    }

    patchStaticFragmentCard(
      {
        id: TEST_FRAGMENT_ID,
        tree: h('store-create', { class: 'store-create' }, []),
        head: [],
        css: '',
        cacheUpdatedAt: 2,
        meta: {
          cacheKey: TEST_FRAGMENT_ID,
          ttl: 30,
          staleTtl: 60,
          runtime: 'edge',
          tags: []
        }
      },
      routeData
    )

    expect(card.dataset.revealPhase).toBe('holding')
    expect(card.dataset.fragmentReady).toBeUndefined()

    await flushAsyncWork()

    expect(body.innerHTML).toContain('デジタル商品')
    expect(body.innerHTML).not.toContain('Digital product')
    expect(body.innerHTML).toContain('アイテム追加')
    expect(card.getAttribute('data-fragment-version')).toBe('2')
    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(card.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('0ms')
    expect(card.dataset.revealPhase).toBe('visible')
    expect(card.dataset.fragmentReady).toBe('true')
  })

  it('falls back to raw static store text when fragment copy is not seeded', async () => {
    const body = new MockBodyElement()
    const card = new MockCardElement(body)
    const doc = new MockDocument(card)

    globalThis.document = doc as unknown as Document
    globalThis.window = {
      innerWidth: 1280,
      innerHeight: 800,
      localStorage: createStorage()
    } as unknown as Window & typeof globalThis
    globalThis.HTMLElement = MockCardElement as unknown as typeof HTMLElement
    globalThis.CustomEvent = class MockCustomEvent<T = unknown> extends Event {
      detail: T

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type)
        this.detail = init?.detail as T
      }
    } as unknown as typeof CustomEvent
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof requestAnimationFrame

    const routeData: StaticFragmentRouteData = {
      lang: 'en',
      path: '/store',
      snapshotKey: '/store',
      authPolicy: 'public',
      bootstrapMode: 'fragment-static',
      fragmentOrder: [TEST_FRAGMENT_ID],
      planSignature: 'store-plan',
      versionSignature: 'store-version',
      runtimePlanEntries: [],
      fragmentVersions: {
        [TEST_FRAGMENT_ID]: 2
      },
      storeSeed: {
        stream: {
          items: [{ id: 2, name: 'Item 2', price: 6, quantity: 2 }],
          sort: 'id',
          dir: 'asc'
        },
        cart: { items: [], queuedCount: 0 }
      },
      contactInvitesSeed: null
    }

    patchStaticFragmentCard(
      {
        id: TEST_FRAGMENT_ID,
        tree: h('store-stream', { class: 'store-stream', 'data-limit': '12' }, []),
        head: [],
        css: '',
        cacheUpdatedAt: 2,
        meta: {
          cacheKey: TEST_FRAGMENT_ID,
          ttl: 30,
          staleTtl: 60,
          runtime: 'edge',
          tags: []
        }
      },
      routeData
    )

    await flushAsyncWork()

    expect(body.innerHTML).toContain('Search the store...')
    expect(body.innerHTML).toContain('Item 2')
    expect(body.innerHTML).toContain('Add to cart')
    expect(card.getAttribute('data-fragment-version')).toBe('2')
  })

  it('keeps already-visible static fragment cards visible during refresh patches', async () => {
    const body = new MockBodyElement()
    const card = new MockCardElement(body, {
      version: 1,
      readyStaggerState: 'done',
      revealPhase: 'visible',
      fragmentReady: true,
      fragmentStage: 'ready'
    })
    const doc = new MockDocument(card)

    globalThis.document = doc as unknown as Document
    globalThis.window = {
      innerWidth: 1280,
      innerHeight: 800,
      localStorage: createStorage()
    } as unknown as Window & typeof globalThis
    globalThis.HTMLElement = MockCardElement as unknown as typeof HTMLElement
    globalThis.CustomEvent = class MockCustomEvent<T = unknown> extends Event {
      detail: T

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type)
        this.detail = init?.detail as T
      }
    } as unknown as typeof CustomEvent
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof requestAnimationFrame

    const routeData: StaticFragmentRouteData = {
      lang: 'en',
      path: '/store',
      snapshotKey: '/store',
      authPolicy: 'public',
      bootstrapMode: 'fragment-static',
      fragmentOrder: [TEST_FRAGMENT_ID],
      planSignature: 'store-plan',
      versionSignature: 'store-version',
      runtimePlanEntries: [],
      fragmentVersions: {
        [TEST_FRAGMENT_ID]: 2
      },
      storeSeed: {
        stream: { items: [], sort: 'id', dir: 'asc' },
        cart: { items: [], queuedCount: 0 }
      },
      contactInvitesSeed: null
    }

    patchStaticFragmentCard(
      {
        id: TEST_FRAGMENT_ID,
        tree: h('store-create', { class: 'store-create' }, []),
        head: [],
        css: '',
        cacheUpdatedAt: 2,
        meta: {
          cacheKey: TEST_FRAGMENT_ID,
          ttl: 30,
          staleTtl: 60,
          runtime: 'edge',
          tags: []
        }
      },
      routeData
    )

    expect(card.dataset.revealPhase).toBe('visible')
    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(card.dataset.fragmentReady).toBe('true')

    await flushAsyncWork()

    expect(card.dataset.revealPhase).toBe('visible')
    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(card.dataset.fragmentReady).toBe('true')
    expect(card.dataset.revealLocked).toBe('false')
  })
})

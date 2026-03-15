import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { h } from '@core/fragment/tree'
import { seedLanguageResources, resetLanguageClientCacheForTests } from '../lang/client'
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
}

class MockBodyElement {
  innerHTML = ''
}

class MockCardElement {
  dataset: Record<string, string> = {
    fragmentId: TEST_FRAGMENT_ID
  }
  style = new MockStyle()
  scrollHeight = 489
  private attrs = new Map<string, string>([
    ['data-fragment-id', TEST_FRAGMENT_ID],
    ['data-static-fragment-card', 'true'],
    ['data-static-fragment-body', TEST_FRAGMENT_ID],
    ['data-fragment-height-hint', '489'],
    ['data-fragment-version', '1']
  ])

  constructor(private readonly body: MockBodyElement) {}

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
    resetLanguageClientCacheForTests()
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    globalThis.CustomEvent = originalCustomEvent
    globalThis.HTMLElement = originalHTMLElement
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  })

  it('uses translated fragment copy when patching static store fragments', async () => {
    const body = new MockBodyElement()
    const card = new MockCardElement(body)
    const doc = new MockDocument(card)

    globalThis.document = doc as unknown as Document
    globalThis.window = {
      innerWidth: 1280,
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

    await flushAsyncWork()

    expect(body.innerHTML).toContain('デジタル商品')
    expect(body.innerHTML).not.toContain('Digital product')
    expect(body.innerHTML).toContain('アイテム追加')
    expect(card.getAttribute('data-fragment-version')).toBe('2')
  })
})

import { afterEach, describe, expect, it } from 'bun:test'
import { ROUTE_WARMUP_STATE_KEY } from '../fragment/cache-scope'

import {
  FRAGMENT_RESIDENT_KEY_ATTR,
  FRAGMENT_RESIDENT_MODE_ATTR,
  FRAGMENT_RESIDENT_STATE_ATTR,
  buildResidentFragmentAttrs,
  destroyResidentFragmentScope,
  invalidateResidentFragments,
  parkResidentSubtreesWithin,
  readResidentFragmentMeta,
  readResidentFragmentMode,
  registerResidentFragmentCleanup,
  resetResidentFragmentManagerForTests,
  resolveResidentFragmentMode,
  restoreResidentSubtreesWithin,
  subscribeResidentFragmentLifecycle
} from './resident-fragment-manager'

const RESIDENT_HOST_ATTR = 'data-fragment-resident-host'
const originalWindow = globalThis.window

const toDatasetKey = (name: string) =>
  name
    .replace(/^data-/, '')
    .split('-')
    .map((part, index) => (index === 0 ? part : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`))
    .join('')

class MockElement {
  readonly nodeType = 1
  readonly dataset: Record<string, string> = {}
  readonly style: Record<string, string> = {}
  readonly children: MockElement[] = []
  parentElement: MockElement | null = null
  hidden = false
  lang = ''
  private readonly attributes = new Map<string, string>()
  private connectedRoot = false

  constructor(
    readonly ownerDocument: MockDocument,
    readonly tagName = 'div'
  ) {}

  get isConnected() {
    return this.parentElement ? this.parentElement.isConnected : this.connectedRoot
  }

  connectAsRoot() {
    this.connectedRoot = true
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
    if (name.startsWith('data-')) {
      this.dataset[toDatasetKey(name)] = value
    }
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string) {
    return this.attributes.has(name)
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
    if (name.startsWith('data-')) {
      delete this.dataset[toDatasetKey(name)]
    }
  }

  appendChild(child: MockElement) {
    child.remove()
    child.parentElement = this
    this.children.push(child)
    return child
  }

  replaceWith(next: MockElement) {
    if (!this.parentElement) {
      return
    }
    const parent = this.parentElement
    const index = parent.children.indexOf(this)
    if (index === -1) {
      return
    }
    next.remove()
    next.parentElement = parent
    parent.children[index] = next
    this.parentElement = null
  }

  remove() {
    if (!this.parentElement) {
      return
    }
    const parent = this.parentElement
    const index = parent.children.indexOf(this)
    if (index >= 0) {
      parent.children.splice(index, 1)
    }
    this.parentElement = null
  }

  contains(node: MockElement) {
    if (this === node) {
      return true
    }
    return this.children.some((child) => child.contains(node))
  }

  closest<T extends MockElement = MockElement>(selector: string) {
    let current: MockElement | null = this
    while (current) {
      if (current.matches(selector)) {
        return current as T
      }
      current = current.parentElement
    }
    return null
  }

  matches(selector: string) {
    return selector
      .split(',')
      .map((value) => value.trim())
      .some((candidate) => {
        const attributeMatch = candidate.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
        if (!attributeMatch) {
          return false
        }
        const [, name, value] = attributeMatch
        if (!this.hasAttribute(name)) {
          return false
        }
        if (typeof value === 'string') {
          return this.getAttribute(name) === value
        }
        return true
      })
  }

  querySelectorAll<T extends MockElement = MockElement>(selector: string) {
    const results: T[] = []
    const visit = (element: MockElement) => {
      element.children.forEach((child) => {
        if (child.matches(selector)) {
          results.push(child as T)
        }
        visit(child)
      })
    }
    visit(this)
    return results
  }

  querySelector<T extends MockElement = MockElement>(selector: string) {
    return this.querySelectorAll<T>(selector)[0] ?? null
  }
}

class MockDocument {
  readonly body = new MockElement(this, 'body')
  readonly documentElement = new MockElement(this, 'html')
  readonly location = { pathname: '/' }

  constructor(lang = 'en') {
    this.documentElement.lang = lang
    this.documentElement.connectAsRoot()
    this.body.connectAsRoot()
  }

  createElement(tagName: string) {
    return new MockElement(this, tagName)
  }

  querySelector<T extends MockElement = MockElement>(selector: string) {
    if (this.body.matches(selector)) {
      return this.body as T
    }
    return this.body.querySelector<T>(selector)
  }
}

const appendResidentWidget = ({
  card,
  doc,
  residentKey,
  residentMode = 'park',
  widgetHydrated = 'true'
}: {
  card: MockElement
  doc: MockDocument
  residentKey: string
  residentMode?: 'park' | 'live'
  widgetHydrated?: string
}) => {
  const widget = doc.createElement('div')
  widget.setAttribute('data-fragment-widget', 'preact-island')
  widget.setAttribute('data-fragment-widget-hydrated', widgetHydrated)
  Object.entries(buildResidentFragmentAttrs(residentKey, residentMode)).forEach(([name, value]) => {
    widget.setAttribute(name, value)
  })
  card.appendChild(widget)
  return widget
}

afterEach(() => {
  resetResidentFragmentManagerForTests()
  globalThis.window = originalWindow
})

describe('resident-fragment-manager', () => {
  it('normalizes resident modes and emits resident mode attributes', () => {
    expect(resolveResidentFragmentMode(true)).toBe('park')
    expect(resolveResidentFragmentMode({ key: 'demo' })).toBe('park')
    expect(resolveResidentFragmentMode({ mode: 'live' })).toBe('live')

    expect(buildResidentFragmentAttrs('demo', 'live')).toEqual({
      'data-fragment-resident': 'true',
      'data-fragment-resident-key': 'demo',
      'data-fragment-resident-mode': 'live'
    })
  })

  it('parks and restores resident widgets into a matching placeholder', () => {
    const doc = new MockDocument('en')
    const routeRoot = doc.createElement('section')
    routeRoot.setAttribute('data-static-home-root', 'true')
    routeRoot.setAttribute('data-static-path', '/')
    const originalCard = doc.createElement('article')
    originalCard.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
    originalCard.setAttribute('data-static-home-patch-state', 'ready')
    routeRoot.appendChild(originalCard)
    doc.body.appendChild(routeRoot)

    const residentKey = 'fragment://page/home/island@v1::preact-island::resident'
    const widget = appendResidentWidget({
      card: originalCard,
      doc,
      residentKey
    })
    const cleanupCalls: string[] = []
    registerResidentFragmentCleanup(widget as unknown as HTMLElement, () => {
      cleanupCalls.push('cleanup')
    })

    expect(parkResidentSubtreesWithin(routeRoot as unknown as ParentNode)).toBe(1)
    const residentHost = doc.body.querySelector<MockElement>(`[${RESIDENT_HOST_ATTR}="true"]`)
    expect(residentHost?.contains(widget)).toBe(true)
    expect(widget.getAttribute(FRAGMENT_RESIDENT_STATE_ATTR)).toBe('parked')

    const nextRouteRoot = doc.createElement('section')
    nextRouteRoot.setAttribute('data-static-home-root', 'true')
    nextRouteRoot.setAttribute('data-static-path', '/')
    const nextCard = doc.createElement('article')
    nextCard.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
    nextCard.setAttribute('data-static-home-patch-state', 'pending')
    nextCard.setAttribute('data-fragment-stage', 'waiting-payload')
    nextRouteRoot.appendChild(nextCard)
    const placeholder = appendResidentWidget({
      card: nextCard,
      doc,
      residentKey,
      widgetHydrated: 'false'
    })
    doc.body.appendChild(nextRouteRoot)

    expect(restoreResidentSubtreesWithin(nextRouteRoot as unknown as ParentNode)).toBe(1)
    expect(nextCard.contains(widget)).toBe(true)
    expect(nextCard.contains(placeholder)).toBe(false)
    expect(widget.getAttribute(FRAGMENT_RESIDENT_STATE_ATTR)).toBe('attached')
    expect(nextCard.dataset.fragmentReady).toBe('true')
    expect(nextCard.dataset.fragmentStage).toBe('ready')
    expect(nextCard.dataset.revealPhase).toBe('visible')
    expect(nextCard.getAttribute('data-static-home-patch-state')).toBe('ready')
    expect(cleanupCalls).toHaveLength(0)
  })

  it('publishes resident lifecycle changes with live mode metadata', () => {
    const doc = new MockDocument('en')
    const routeRoot = doc.createElement('section')
    routeRoot.setAttribute('data-static-home-root', 'true')
    routeRoot.setAttribute('data-static-path', '/')
    const card = doc.createElement('article')
    card.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
    routeRoot.appendChild(card)
    doc.body.appendChild(routeRoot)

    const residentKey = 'fragment://page/home/island@v1::preact-island::resident'
    const widget = appendResidentWidget({
      card,
      doc,
      residentKey,
      residentMode: 'live'
    })

    registerResidentFragmentCleanup(widget as unknown as HTMLElement, () => undefined)
    const lifecycleEvents: string[] = []
    const unsubscribe = subscribeResidentFragmentLifecycle(widget as unknown as HTMLElement, ({ state, mode }) => {
      lifecycleEvents.push(`${state}:${mode}`)
    })

    expect(readResidentFragmentMode(widget as unknown as HTMLElement)).toBe('live')
    expect(widget.getAttribute(FRAGMENT_RESIDENT_MODE_ATTR)).toBe('live')

    parkResidentSubtreesWithin(routeRoot as unknown as ParentNode)
    invalidateResidentFragments({
      scopeKey: 'public',
      path: '/',
      lang: 'en',
      residentKey
    })

    unsubscribe()

    expect(lifecycleEvents).toEqual(['attached:live', 'parked:live', 'destroyed:live'])
  })

  it('reads resident metadata from descendant elements', () => {
    const doc = new MockDocument('en')
    const routeRoot = doc.createElement('section')
    routeRoot.setAttribute('data-static-home-root', 'true')
    routeRoot.setAttribute('data-static-path', '/')
    const card = doc.createElement('article')
    card.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
    routeRoot.appendChild(card)
    doc.body.appendChild(routeRoot)

    const residentKey = 'fragment://page/home/island@v1::preact-island::resident'
    const widget = appendResidentWidget({
      card,
      doc,
      residentKey,
      residentMode: 'live'
    })
    const innerRoot = doc.createElement('div')
    innerRoot.setAttribute('class', 'preact-island-ui')
    widget.appendChild(innerRoot)

    expect(readResidentFragmentMeta(innerRoot as unknown as Element)).toEqual({
      fragmentId: 'fragment://page/home/island@v1',
      lang: 'en',
      mode: 'live',
      path: '/',
      residentKey,
      scopeKey: 'public'
    })
  })

  it('invalidates only parked residents when requested', () => {
    const doc = new MockDocument('en')
    const routeRoot = doc.createElement('section')
    routeRoot.setAttribute('data-static-home-root', 'true')
    routeRoot.setAttribute('data-static-path', '/')
    const card = doc.createElement('article')
    card.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
    routeRoot.appendChild(card)
    doc.body.appendChild(routeRoot)

    const residentKey = 'fragment://page/home/island@v1::preact-island::resident'
    const widget = appendResidentWidget({
      card,
      doc,
      residentKey
    })
    let cleanupCalls = 0
    registerResidentFragmentCleanup(widget as unknown as HTMLElement, () => {
      cleanupCalls += 1
    })

    parkResidentSubtreesWithin(routeRoot as unknown as ParentNode)

    invalidateResidentFragments({
      scopeKey: 'public',
      path: '/',
      lang: 'en',
      fragmentId: 'fragment://page/home/island@v1',
      parkedOnly: true
    })

    expect(cleanupCalls).toBe(1)
    expect(widget.getAttribute(FRAGMENT_RESIDENT_STATE_ATTR)).toBeNull()
    expect(doc.body.querySelector(`[${FRAGMENT_RESIDENT_KEY_ATTR}="${residentKey}"]`)).toBeNull()
  })

  it('clears only the requested resident scope', () => {
    globalThis.window = {
      [ROUTE_WARMUP_STATE_KEY]: {
        userCacheKey: 'user-123'
      }
    } as unknown as Window & typeof globalThis

    const publicDoc = new MockDocument('en')
    const routeRoot = publicDoc.createElement('section')
    routeRoot.setAttribute('data-static-home-root', 'true')
    routeRoot.setAttribute('data-static-path', '/')
    publicDoc.body.appendChild(routeRoot)

    const publicCard = publicDoc.createElement('article')
    publicCard.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
    routeRoot.appendChild(publicCard)
    const publicWidget = appendResidentWidget({
      card: publicCard,
      doc: publicDoc,
      residentKey: 'public-resident'
    })

    const authDoc = new MockDocument('en')
    const authRouteRoot = authDoc.createElement('section')
    authRouteRoot.setAttribute('data-static-fragment-root', 'true')
    authRouteRoot.setAttribute('data-static-path', '/chat')
    authDoc.body.appendChild(authRouteRoot)
    const authCard = authDoc.createElement('article')
    authCard.setAttribute('data-fragment-id', 'fragment://page/chat/live@v1')
    authRouteRoot.appendChild(authCard)
    const authWidget = appendResidentWidget({
      card: authCard,
      doc: authDoc,
      residentKey: 'auth-resident'
    })

    let publicCleanupCalls = 0
    let authCleanupCalls = 0
    registerResidentFragmentCleanup(publicWidget as unknown as HTMLElement, () => {
      publicCleanupCalls += 1
    })
    registerResidentFragmentCleanup(authWidget as unknown as HTMLElement, () => {
      authCleanupCalls += 1
    })

    destroyResidentFragmentScope('user:user-123')
    expect(publicCleanupCalls).toBe(0)
    expect(authCleanupCalls).toBe(1)
    expect(routeRoot.contains(publicWidget)).toBe(true)
  })
})

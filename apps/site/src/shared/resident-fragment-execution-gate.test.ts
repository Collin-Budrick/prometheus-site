import { afterEach, describe, expect, it } from 'bun:test'
import {
  buildResidentFragmentAttrs,
  invalidateResidentFragments,
  parkResidentSubtreesWithin,
  registerResidentFragmentCleanup,
  resetResidentFragmentManagerForTests,
  restoreResidentSubtreesWithin
} from './resident-fragment-manager'
import { createResidentFragmentExecutionGate } from './resident-fragment-execution-gate'

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
  visibilityState: 'visible' | 'hidden' = 'visible'
  private readonly listeners = new Map<string, Set<() => void>>()

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

  addEventListener(type: string, listener: () => void) {
    const current = this.listeners.get(type) ?? new Set()
    current.add(listener)
    this.listeners.set(type, current)
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener)
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener())
  }
}

const createResidentRoot = (doc: MockDocument, mode: 'park' | 'live') => {
  const routeRoot = doc.createElement('section')
  routeRoot.setAttribute('data-static-home-root', 'true')
  routeRoot.setAttribute('data-static-path', '/')
  doc.body.appendChild(routeRoot)

  const card = doc.createElement('article')
  card.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
  routeRoot.appendChild(card)

  const widget = doc.createElement('div')
  Object.entries(buildResidentFragmentAttrs('fragment://page/home/island@v1::preact-island::resident', mode)).forEach(
    ([name, value]) => widget.setAttribute(name, value)
  )
  card.appendChild(widget)
  registerResidentFragmentCleanup(widget as unknown as HTMLElement, () => undefined)
  return { routeRoot, widget }
}

afterEach(() => {
  resetResidentFragmentManagerForTests()
})

describe('resident-fragment-execution-gate', () => {
  it('treats non-resident offscreen roots as inactive', () => {
    const doc = new MockDocument('en')
    const root = doc.createElement('div')
    doc.body.appendChild(root)

    const gate = createResidentFragmentExecutionGate({
      root: root as unknown as HTMLElement
    })

    expect(gate.isActive()).toBe(true)
    gate.setViewportActive(false)
    expect(gate.isActive()).toBe(false)

    gate.setViewportActive(true)
    expect(gate.isActive()).toBe(true)

    doc.visibilityState = 'hidden'
    doc.emit('visibilitychange')
    expect(gate.isActive()).toBe(false)

    gate.destroy()
  })

  it('keeps live residents active while parked and when the tab is hidden', () => {
    const doc = new MockDocument('en')
    const { routeRoot, widget } = createResidentRoot(doc, 'live')
    const gate = createResidentFragmentExecutionGate({
      root: widget as unknown as HTMLElement
    })

    expect(gate.isActive()).toBe(true)
    gate.setViewportActive(false)
    expect(gate.isActive()).toBe(true)

    parkResidentSubtreesWithin(routeRoot as unknown as ParentNode)
    expect(gate.isActive()).toBe(true)

    doc.visibilityState = 'hidden'
    doc.emit('visibilitychange')
    expect(gate.isActive()).toBe(true)

    invalidateResidentFragments({
      scopeKey: 'public',
      path: '/',
      lang: 'en',
      residentKey: 'fragment://page/home/island@v1::preact-island::resident'
    })
    expect(gate.isActive()).toBe(false)

    gate.destroy()
  })

  it('treats parked park-mode residents as inactive until restored', () => {
    const doc = new MockDocument('en')
    const { routeRoot, widget } = createResidentRoot(doc, 'park')
    const gate = createResidentFragmentExecutionGate({
      root: widget as unknown as HTMLElement
    })

    expect(gate.isActive()).toBe(true)
    parkResidentSubtreesWithin(routeRoot as unknown as ParentNode)
    expect(gate.isActive()).toBe(false)

    const nextRouteRoot = doc.createElement('section')
    nextRouteRoot.setAttribute('data-static-home-root', 'true')
    nextRouteRoot.setAttribute('data-static-path', '/')
    const nextCard = doc.createElement('article')
    nextCard.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
    nextRouteRoot.appendChild(nextCard)
    const placeholder = doc.createElement('div')
    Object.entries(buildResidentFragmentAttrs('fragment://page/home/island@v1::preact-island::resident', 'park')).forEach(
      ([name, value]) => placeholder.setAttribute(name, value)
    )
    nextCard.appendChild(placeholder)
    doc.body.appendChild(nextRouteRoot)

    restoreResidentSubtreesWithin(nextRouteRoot as unknown as ParentNode)
    expect(gate.isActive()).toBe(true)

    gate.destroy()
  })
})

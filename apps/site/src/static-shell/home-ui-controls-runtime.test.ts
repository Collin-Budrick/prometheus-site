import { afterEach, describe, expect, it } from 'bun:test'
import { bindHomeUiControls } from './home-ui-controls-runtime'

class MockElement {
  id = ''
  className = ''
  hidden = false
  checked = false
  type = ''
  name = ''
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  textContent = ''
  ownerDocument: MockDocument | null = null
  parentElement: MockElement | null = null
  private attrs = new Map<string, string>()
  private listeners = new Map<string, Array<(event: Event) => void>>()
  private children: MockElement[] = []

  constructor(readonly tagName: string) {}

  get classList() {
    const read = () => this.className.split(/\s+/).filter(Boolean)
    const write = (tokens: string[]) => {
      this.className = tokens.join(' ')
    }

    return {
      contains: (token: string) => read().includes(token)
    }
  }

  append(...nodes: MockElement[]) {
    nodes.forEach((node) => {
      node.parentElement = this
      node.ownerDocument = this.ownerDocument
      this.children.push(node)
    })
  }

  replaceChildren(...nodes: MockElement[]) {
    this.children = []
    this.append(...nodes)
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
    if (name === 'id') {
      this.id = value
    }
    if (!name.startsWith('data-')) return
    const datasetKey = name
      .slice(5)
      .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    this.dataset[datasetKey] = value
  }

  getAttribute(name: string) {
    if (name === 'id') return this.id || null
    return this.attrs.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
    if (!name.startsWith('data-')) return
    const datasetKey = name
      .slice(5)
      .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    delete this.dataset[datasetKey]
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      listeners.filter((value) => value !== listener)
    )
  }

  dispatchEvent(event: Event) {
    ;(this.listeners.get(event.type) ?? []).slice().forEach((listener) => listener(event))
    return true
  }

  focus() {
    this.ownerDocument?.setActiveElement(this)
  }

  blur() {
    if (this.ownerDocument?.activeElement === this) {
      this.ownerDocument.setActiveElement(null)
    }
  }

  contains(node: unknown): boolean {
    if (!(node instanceof MockElement)) {
      return false
    }
    if (node === this) {
      return true
    }
    return this.children.some((child) => child.contains(node))
  }

  querySelector<T extends MockElement = MockElement>(selector: string) {
    return this.querySelectorAll<T>(selector)[0] ?? null
  }

  querySelectorAll<T extends MockElement = MockElement>(selector: string) {
    const results: MockElement[] = []
    const visit = (node: MockElement) => {
      if (matchesSelector(node, selector)) {
        results.push(node)
      }
      node.children.forEach(visit)
    }
    this.children.forEach(visit)
    return results as T[]
  }
}

class MockDocument {
  readonly documentElement = {
    dataset: { theme: 'light' },
    style: {} as Record<string, string>
  }
  cookie = ''
  activeElement: MockElement | null = null
  readonly body = new MockElement('body')
  readonly head = new MockElement('head')
  private listeners = new Map<string, Array<(event: Event) => void>>()

  constructor() {
    this.body.ownerDocument = this
    this.head.ownerDocument = this
  }

  setActiveElement(element: MockElement | null) {
    this.activeElement = element
  }

  createElement(tagName: string) {
    const element = new MockElement(tagName)
    element.ownerDocument = this
    return element
  }

  createElementNS(_namespace: string, tagName: string) {
    return this.createElement(tagName)
  }

  querySelector<T extends MockElement = MockElement>(selector: string) {
    return this.head.querySelector<T>(selector) ?? this.body.querySelector<T>(selector)
  }

  querySelectorAll<T extends MockElement = MockElement>(selector: string) {
    return [...this.head.querySelectorAll<T>(selector), ...this.body.querySelectorAll<T>(selector)]
  }

  getElementById(id: string) {
    return this.querySelector<MockElement>(`#${id}`)
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      listeners.filter((value) => value !== listener)
    )
  }
}

const matchesSelector = (node: MockElement, selector: string) => {
  if (selector.startsWith('.')) {
    return node.className.split(/\s+/).includes(selector.slice(1))
  }

  if (selector.startsWith('#')) {
    return node.id === selector.slice(1)
  }

  if (selector.startsWith('[') && selector.endsWith(']')) {
    const content = selector.slice(1, -1)
    const [name, rawValue] = content.split('=')
    const attrName = name.trim()
    if (!rawValue) {
      return node.getAttribute(attrName) !== null
    }
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '')
    return node.getAttribute(attrName) === value
  }

  return node.tagName.toLowerCase() === selector.toLowerCase()
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const originalDocument = globalThis.document
const originalWindow = globalThis.window

afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow
  })
})

describe('bindHomeUiControls', () => {
  it('waits for deferred styles before opening the settings overlay', async () => {
    const doc = new MockDocument()
    const settingsRoot = doc.createElement('div')
    settingsRoot.className = 'topbar-settings'
    settingsRoot.dataset.open = 'false'
    const settingsToggle = doc.createElement('button')
    settingsToggle.setAttribute('data-static-settings-toggle', '')
    settingsRoot.append(settingsToggle)
    doc.body.append(settingsRoot)

    const win = {
      localStorage: {
        setItem: () => undefined
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: doc
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: win
    })

    const callOrder: string[] = []
    let resolveStyles!: () => void
    const stylesheetReady = new Promise<void>((resolve) => {
      resolveStyles = () => {
        callOrder.push('stylesheet:ready')
        resolve()
      }
    })

    const bound = bindHomeUiControls({
      controller: {
        cleanupFns: [],
        lang: 'en'
      },
      onLanguageChange: () => undefined,
      ensureDeferredStylesheet: async () => {
        callOrder.push('stylesheet:start')
        await stylesheetReady
      }
    })

    expect(bound).toBe(true)

    settingsToggle.dispatchEvent(new Event('click'))
    await flushMicrotasks()

    const settingsPanel = settingsRoot.querySelector<MockElement>('.settings-dropdown')
    expect(callOrder).toEqual(['stylesheet:start'])
    expect(settingsRoot.dataset.open).toBe('false')
    expect(settingsPanel?.hidden).toBe(true)

    resolveStyles()
    await flushMicrotasks()

    expect(callOrder).toEqual(['stylesheet:start', 'stylesheet:ready'])
    expect(settingsRoot.dataset.open).toBe('true')
    expect(settingsPanel?.hidden).toBe(false)
  })
})

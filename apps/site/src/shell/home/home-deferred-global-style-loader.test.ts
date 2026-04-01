import { afterEach, describe, expect, it } from 'bun:test'
import {
  ensureHomeDeferredGlobalStylesheet,
  HOME_DEFERRED_GLOBAL_STYLE_META_NAME,
  readHomeDeferredGlobalStyleHref,
  resetHomeDeferredGlobalStylePromisesForTests
} from './home-deferred-global-style-loader'

type MockListener = () => void

class MockLinkElement {
  rel = ''
  href = ''
  sheet: {} | null = null
  private readonly attributes = new Map<string, string>()
  private readonly listeners = new Map<string, Set<MockListener>>()

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
    if (name === 'rel') {
      this.rel = value
    }
    if (name === 'href') {
      this.href = value
    }
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  addEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  emit(type: string) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener())
  }
}

class MockHead {
  constructor(readonly links: MockLinkElement[]) {}

  appendChild(link: MockLinkElement) {
    this.links.push(link)
    return link
  }
}

class MockMetaElement {
  constructor(private readonly content: string) {}

  getAttribute(name: string) {
    if (name === 'content') {
      return this.content
    }
    return null
  }
}

class MockDocument {
  readonly links: MockLinkElement[] = []
  readonly head = new MockHead(this.links)
  readonly baseURI = 'https://prometheus.prod/?lang=en'

  constructor(private readonly href: string | null) {}

  createElement() {
    return new MockLinkElement()
  }

  querySelector(selector: string) {
    if (selector === `meta[name="${HOME_DEFERRED_GLOBAL_STYLE_META_NAME}"]`) {
      return this.href ? new MockMetaElement(this.href) : null
    }
    return null
  }

  querySelectorAll() {
    return this.links
  }
}

afterEach(() => {
  resetHomeDeferredGlobalStylePromisesForTests()
})

describe('home-deferred-global-style-loader', () => {
  it('reads the deferred home global stylesheet href from SSR metadata', () => {
    const doc = new MockDocument('/assets/app-style.css')

    expect(readHomeDeferredGlobalStyleHref(doc as never)).toBe('/assets/app-style.css')
  })

  it('appends the deferred stylesheet once and dedupes by canonical href', async () => {
    const doc = new MockDocument('/assets/app-style.css')

    const firstPromise = ensureHomeDeferredGlobalStylesheet({
      doc: doc as never
    })
    expect(doc.links).toHaveLength(1)
    expect(doc.links[0]?.rel).toBe('stylesheet')
    expect(doc.links[0]?.href).toBe('/assets/app-style.css')

    const secondPromise = ensureHomeDeferredGlobalStylesheet({
      doc: doc as never
    })
    expect(doc.links).toHaveLength(1)
    expect(secondPromise).toBe(firstPromise)

    doc.links[0]?.emit('load')
    await firstPromise

    const otherUrlForm = new MockDocument('https://prometheus.prod/assets/app-style.css')
    otherUrlForm.links.push(doc.links[0] as MockLinkElement)

    const thirdPromise = ensureHomeDeferredGlobalStylesheet({
      doc: otherUrlForm as never
    })
    expect(otherUrlForm.links).toHaveLength(1)
    expect(thirdPromise).toBe(firstPromise)
  })
})

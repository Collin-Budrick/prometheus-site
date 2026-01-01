import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { applyFragmentEffects, teardownFragmentEffects } from './client'
import type { FragmentPayload } from './types'

class MockElement {
  tagName: string
  attributes: Record<string, string> = {}
  children: MockElement[] = []
  dataset: Record<string, string> = {}
  parentNode: MockElement | null = null
  textContent = ''

  constructor(tagName: string) {
    this.tagName = tagName
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value
  }

  appendChild(child: MockElement) {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  removeChild(child: MockElement) {
    this.children = this.children.filter((node) => node !== child)
    child.parentNode = null
  }
}

class MockDocument {
  head = new MockElement('head')
  title = ''

  createElement(tag: string) {
    return new MockElement(tag)
  }
}

let originalDocument: Document | undefined

describe('fragment effects lifecycle', () => {
  beforeEach(() => {
    originalDocument = globalThis.document
    globalThis.document = new MockDocument() as unknown as Document
  })

  afterEach(() => {
    globalThis.document = originalDocument as Document
  })

  it('tears down head and style elements even when cache keys differ from plan ids', () => {
    const payload: FragmentPayload = {
      id: 'fragment://plan-id',
      css: '.demo { color: red; }',
      head: [{ op: 'meta', name: 'description', content: 'demo fragment' }],
      meta: {
        cacheKey: 'fragment://cache-key',
        runtime: 'edge',
        staleTtl: 10,
        tags: ['demo'],
        ttl: 5
      },
      tree: { type: 'element', tag: 'div', attrs: { class: 'demo' } }
    }

    applyFragmentEffects(payload)

    const mockHead = (globalThis.document as unknown as MockDocument).head
    expect(mockHead.children.length).toBe(2) // style + meta

    teardownFragmentEffects([payload.id])

    expect(mockHead.children.length).toBe(0)
  })
})

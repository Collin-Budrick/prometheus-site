import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { syncAvatarPreview } from './profile-static-controller'

class MockElement {
  dataset: Record<string, string> = {}
  textContent = ''
  src = ''
  alt = ''
  loading = ''
  children: MockElement[] = []

  constructor(public readonly tagName: string) {}

  append(...nodes: MockElement[]) {
    this.children.push(...nodes)
  }

  replaceChildren(...nodes: MockElement[]) {
    this.children = [...nodes]
  }
}

const originalDocument = globalThis.document

beforeEach(() => {
  globalThis.document = {
    createElement: (tagName: string) => new MockElement(tagName)
  } as never
})

afterEach(() => {
  globalThis.document = originalDocument
})

describe('syncAvatarPreview', () => {
  it('creates an img element for avatar data without using raw html', () => {
    const root = new MockElement('div')

    syncAvatarPreview(root as never, 'data:image/png;base64,abc', 'Ada Lovelace')

    expect(root.dataset.empty).toBe('false')
    expect(root.children).toHaveLength(1)
    expect(root.children[0]?.tagName).toBe('img')
    expect(root.children[0]?.src).toBe('data:image/png;base64,abc')
    expect(root.children[0]?.alt).toBe('Profile')
  })

  it('creates initials fallback content when no avatar is present', () => {
    const root = new MockElement('div')

    syncAvatarPreview(root as never, null, 'Ada Lovelace')

    expect(root.dataset.empty).toBe('true')
    expect(root.children).toHaveLength(1)
    expect(root.children[0]?.tagName).toBe('span')
    expect(root.children[0]?.textContent).toBe('AL')
  })
})

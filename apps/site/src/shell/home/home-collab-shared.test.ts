import { describe, expect, it } from 'bun:test'
import { setHomeCollabStatus } from './home-collab-shared'

class MockElement {
  readonly dataset: Record<string, string> = {}
  textContent = ''
  private readonly attrs = new Map<string, string>()

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }
}

describe('home-collab-shared', () => {
  it('uses the localized idle status from the root attributes', () => {
    const root = new MockElement() as unknown as HTMLElement & { dataset: DOMStringMap }
    const status = new MockElement() as unknown as HTMLElement

    ;(root as unknown as MockElement).setAttribute(
      'data-collab-status-idle',
      'Localized idle status'
    )

    setHomeCollabStatus(root, status, 'idle')

    expect((status as unknown as MockElement).textContent).toBe('Localized idle status')
  })
})

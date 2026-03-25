import { describe, expect, it } from 'bun:test'
import { installIslandStaticEntry } from './island-static-entry'

type Listener = () => void

class MockWindow {
  __PROM_STATIC_ISLAND_ENTRY__?: boolean
}

class MockElement {}

class MockScriptElement extends MockElement {
  constructor(readonly textContent: string | null) {
    super()
  }
}

class MockDocument {
  readyState: DocumentReadyState = 'complete'
  readonly listeners = new Map<string, Set<Listener>>()
  routeRoot: MockElement | null = new MockElement()
  pageRoot: MockElement | null = new MockElement()
  settingsToggle: MockElement | null = new MockElement()
  shellSeedScript: MockScriptElement | null = new MockScriptElement('{"currentPath":"/login"}')
  islandDataScript: MockScriptElement | null = new MockScriptElement('{"island":"login"}')

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  emit(type: string) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener())
  }

  querySelector(selector: string) {
    switch (selector) {
      case '[data-static-route="island"]':
        return this.routeRoot
      case '[data-static-page-root]':
        return this.pageRoot
      case '[data-static-settings-toggle]':
        return this.settingsToggle
      default:
        return null
    }
  }

  getElementById(id: string) {
    switch (id) {
      case 'prom-static-shell-seed':
        return this.shellSeedScript
      case 'prom-static-island-data':
        return this.islandDataScript
      default:
        return null
    }
  }
}

const flushMicrotasks = async () => {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
  }
}

describe('installIslandStaticEntry', () => {
  it('waits for DOMContentLoaded before bootstrapping the island shell', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    doc.readyState = 'loading'
    let bootstrapCount = 0

    const cleanup = installIslandStaticEntry({
      win: win as never,
      doc: doc as never,
      observeDom: () => () => undefined,
      loadRuntime: async () => ({
        bootstrapStaticIslandShell: async () => {
          bootstrapCount += 1
        }
      })
    })

    expect(bootstrapCount).toBe(0)

    doc.emit('DOMContentLoaded')
    await flushMicrotasks()

    expect(bootstrapCount).toBe(1)

    cleanup()
  })

  it('boots immediately when the document is already ready', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    let bootstrapCount = 0

    const cleanup = installIslandStaticEntry({
      win: win as never,
      doc: doc as never,
      observeDom: () => () => undefined,
      loadRuntime: async () => ({
        bootstrapStaticIslandShell: async () => {
          bootstrapCount += 1
        }
      })
    })

    await flushMicrotasks()

    expect(bootstrapCount).toBe(1)

    cleanup()
  })

  it('reboots the island shell when the island DOM is replaced', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    let bootstrapCount = 0
    let notifyDomChange: (() => void) | null = null

    const cleanup = installIslandStaticEntry({
      win: win as never,
      doc: doc as never,
      observeDom: (callback) => {
        notifyDomChange = callback
        return () => undefined
      },
      loadRuntime: async () => ({
        bootstrapStaticIslandShell: async () => {
          bootstrapCount += 1
        }
      })
    })

    await flushMicrotasks()
    expect(bootstrapCount).toBe(1)

    doc.settingsToggle = new MockElement()
    notifyDomChange?.()
    await flushMicrotasks()

    expect(bootstrapCount).toBe(2)

    cleanup()
  })

  it('disposes the island shell when leaving island routes', async () => {
    const win = new MockWindow()
    const doc = new MockDocument()
    let disposeCount = 0
    let notifyDomChange: (() => void) | null = null

    const cleanup = installIslandStaticEntry({
      win: win as never,
      doc: doc as never,
      observeDom: (callback) => {
        notifyDomChange = callback
        return () => undefined
      },
      loadRuntime: async () => ({
        bootstrapStaticIslandShell: async () => undefined,
        disposeStaticIslandShell: async () => {
          disposeCount += 1
        }
      })
    })

    await flushMicrotasks()
    doc.routeRoot = null
    doc.pageRoot = null
    doc.settingsToggle = null
    doc.shellSeedScript = null
    doc.islandDataScript = null
    notifyDomChange?.()
    await flushMicrotasks()

    expect(disposeCount).toBe(1)

    cleanup()
  })
})

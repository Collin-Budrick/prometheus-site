import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { STATIC_FRAGMENT_DATA_SCRIPT_ID } from './constants'

let registeredCleanup: (() => void) | null = null
let activateCalls = 0
const releaseCalls: Array<Record<string, unknown>> = []

mock.module('./store-static-controller-state', () => ({
  hasRegisteredStoreStaticController: () => typeof registeredCleanup === 'function',
  registerStoreStaticControllerCleanup: (cleanup: () => void) => {
    registeredCleanup = cleanup
  }
}))

mock.module('./controllers/store-static-controller', () => ({
  activateStoreStaticController: async () => {
    activateCalls += 1
    return () => undefined
  }
}))

mock.module('@prometheus/ui/ready-stagger', () => ({
  releaseQueuedReadyStaggerWithin: (options: Record<string, unknown>) => {
    releaseCalls.push(options)
  }
}))

const { bootstrapStaticStoreShell } = await import('./store-static-runtime')

class MockScriptElement {
  constructor(public textContent: string | null) {}
}

class MockRootElement {
  private attrs = new Map<string, string>([['data-static-fragment-paint', 'initial']])

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }
}

class MockDocument {
  constructor(
    private readonly script: MockScriptElement,
    private readonly root: MockRootElement
  ) {}

  getElementById(id: string) {
    return id === STATIC_FRAGMENT_DATA_SCRIPT_ID ? this.script : null
  }

  querySelector(selector: string) {
    return selector === '[data-static-fragment-root]' ? this.root : null
  }
}

beforeEach(() => {
  registeredCleanup = null
  activateCalls = 0
  releaseCalls.length = 0

  const scriptCtor = MockScriptElement as unknown as typeof HTMLScriptElement
  ;(globalThis as typeof globalThis & { HTMLScriptElement?: typeof HTMLScriptElement }).HTMLScriptElement = scriptCtor
})

describe('bootstrapStaticStoreShell', () => {
  it('releases queued store cards after activating the lightweight controller', async () => {
    const root = new MockRootElement()
    const script = new MockScriptElement(JSON.stringify({ path: '/store', lang: 'en' }))

    ;(globalThis as typeof globalThis & { document?: Document }).document = new MockDocument(
      script,
      root
    ) as unknown as Document
    ;(globalThis as typeof globalThis & { window?: Window }).window = {} as Window
    ;(globalThis as typeof globalThis & { performance?: Performance }).performance = {
      mark: () => undefined
    } as Performance

    await bootstrapStaticStoreShell()

    expect(activateCalls).toBe(1)
    expect(root.getAttribute('data-static-fragment-paint')).toBe('ready')
    expect(releaseCalls).toEqual([
      {
        root: document,
        queuedSelector: '[data-static-fragment-root] .fragment-card[data-ready-stagger-state="queued"]',
        group: 'static-fragment-ready'
      }
    ])
  })
})

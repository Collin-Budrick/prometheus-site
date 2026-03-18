import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  ensureFragmentRuntimeAssetPreloads,
  FragmentRuntimeBridge,
  resolveFragmentRuntimeWorkerUrl
} from './client-bridge'

type MockListener = (event: { data: unknown }) => void

class MockWorker {
  static instances: MockWorker[] = []

  readonly posted: unknown[] = []
  terminated = 0
  readonly url: string
  readonly options: { name?: string; type?: string }
  private readonly listeners = new Set<MockListener>()

  constructor(url: string, options: { name?: string; type?: string }) {
    this.url = url
    this.options = options
    MockWorker.instances.push(this)
  }

  addEventListener(_type: string, listener: MockListener) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: string, listener: MockListener) {
    this.listeners.delete(listener)
  }

  terminate() {
    this.terminated += 1
  }

  postMessage(message: unknown) {
    this.posted.push(message)
  }

  dispatch(message: unknown) {
    this.listeners.forEach((listener) => listener({ data: message }))
  }
}

const mutableGlobal = globalThis as unknown as Record<string, unknown>
const originalWindow = mutableGlobal.window
const originalWorker = mutableGlobal.Worker

describe('fragment runtime client bridge', () => {
  beforeEach(() => {
    MockWorker.instances.length = 0
    mutableGlobal.window = {}
    mutableGlobal.Worker = MockWorker
  })

  afterEach(() => {
    mutableGlobal.window = originalWindow
    mutableGlobal.Worker = originalWorker
  })

  it('derives the worker asset URL from the static-shell script base', () => {
    const workerUrl = resolveFragmentRuntimeWorkerUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/fragment-static-entry.js?v=abc123'
              : null
        }
      ]
    })

    expect(workerUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/fragment/runtime/worker.js?v=abc123'
    )
  })

  it('reuses SSR-emitted fragment runtime preload links without appending duplicates', () => {
    class MockLink {
      rel = 'modulepreload'
      private attrs = new Map<string, string>()

      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }

      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
        if (name === 'rel') {
          this.rel = value
        }
      }

      removeAttribute(name: string) {
        this.attrs.delete(name)
      }
    }

    const workerLink = new MockLink()
    workerLink.setAttribute('rel', 'modulepreload')
    workerLink.setAttribute('href', 'https://prometheus.prod/build/static-shell/apps/site/src/fragment/runtime/worker.js')
    workerLink.setAttribute('data-fragment-runtime-preload', 'worker')

    const decodeLink = new MockLink()
    decodeLink.setAttribute('rel', 'modulepreload')
    decodeLink.setAttribute('href', 'https://prometheus.prod/build/static-shell/apps/site/src/fragment/runtime/decode-pool.worker.js')
    decodeLink.setAttribute('data-fragment-runtime-preload', 'decode')

    let appendCount = 0
    const doc = {
      head: {
        appendChild: () => {
          appendCount += 1
          return null
        }
      },
      createElement: () => new MockLink(),
      querySelector: (selector: string) =>
        selector === 'link[data-fragment-runtime-preload="worker"]'
          ? workerLink
          : selector === 'link[data-fragment-runtime-preload="decode"]'
            ? decodeLink
            : null
    }

    ensureFragmentRuntimeAssetPreloads({ doc: doc as never })

    expect(appendCount).toBe(0)
    expect(workerLink.getAttribute('data-fragment-runtime-preload')).toBe('worker')
    expect(decodeLink.getAttribute('data-fragment-runtime-preload')).toBe('decode')
  })

  it('terminates the worker on pagehide and replays init state on restore', () => {
    const bridge = new FragmentRuntimeBridge()
    const onCommit = () => undefined
    const onSizing = () => undefined
    const onStatus = () => undefined
    const onError = () => undefined

    expect(
      bridge.connect({
        clientId: 'client-1',
        apiBase: 'https://prometheus.prod/api',
        path: '/store',
        lang: 'en',
        planEntries: [
          {
            id: 'store-stream',
            critical: true,
            layout: {
              column: '1'
            },
            dependsOn: []
          }
        ],
        initialFragments: [],
        initialSizing: {
          'store-stream': {
            stableHeight: 240
          }
        },
        knownVersions: {
          'store-stream': 7
        },
        visibleIds: ['store-stream'],
        viewportWidth: 1280,
        enableStreaming: true,
        startupMode: 'eager-visible-first',
        bootstrapHref: 'https://prometheus.prod/api/fragments/bootstrap?path=/store&lang=en',
        onCommit,
        onSizing,
        onStatus,
        onError
      })
    ).toBe(true)

    const firstWorker = MockWorker.instances[0]
    expect(firstWorker.posted[0]).toMatchObject({
      type: 'init',
      clientId: 'client-1',
      visibleIds: ['store-stream'],
      startupMode: 'eager-visible-first'
    })

    bridge.setVisibleIds(['store-stream', 'store-cart'])
    bridge.updateLang('ko', [], { 'store-stream': { stableHeight: 320 } }, { 'store-stream': 9 })

    expect(bridge.suspendForPageHide()).toBe(true)
    expect(firstWorker.posted.at(-1)).toMatchObject({
      type: 'dispose',
      clientId: 'client-1'
    })
    expect(firstWorker.terminated).toBe(1)

    expect(bridge.resumeAfterPageShow()).toBe(true)

    const resumedWorker = MockWorker.instances[1]
    expect(resumedWorker.posted[0]).toMatchObject({
      type: 'init',
      clientId: 'client-1',
      lang: 'ko',
      visibleIds: ['store-stream', 'store-cart'],
      initialSizing: {
        'store-stream': {
          stableHeight: 320
        }
      },
      knownVersions: {
        'store-stream': 9
      }
    })
  })
})

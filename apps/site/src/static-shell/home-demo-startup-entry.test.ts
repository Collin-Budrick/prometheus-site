import { afterEach, describe, expect, it } from 'bun:test'
import { installHomeDemoStartupEntry } from './home-demo-startup-entry'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'
import type {
  HomeDemoActivationManager,
  HomeDemoController
} from './home-demo-controller'
import { HOME_DEMO_OBSERVE_EVENT } from './home-demo-observe-event'
import { normalizeHomeDemoAssetMap } from './home-demo-runtime-types'
import {
  clearHomeDemoControllerBinding,
  getHomeDemoControllerBinding,
  setHomeDemoControllerBinding
} from './home-demo-controller-state'

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockDemoRoot {
  dataset: Record<string, string> = {}
  private readonly attrs = new Map<string, string>()
  isConnected = true
  private rect = {
    top: 0,
    left: 0,
    right: 240,
    bottom: 160,
    width: 240,
    height: 160
  }

  constructor(kind = 'planner') {
    this.attrs.set('data-home-demo-root', kind)
    this.dataset.homeDemoRoot = kind
    this.dataset.demoKind = kind
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }

  setRect(rect: {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }) {
    this.rect = rect
  }

  getBoundingClientRect() {
    return this.rect
  }

  closest() {
    return null
  }
}

class MockDocument {
  private readonly listeners = new Map<string, Set<(event: Event) => void>>()
  readonly appendedLinks: MockLinkElement[] = []
  readonly documentElement = { lang: 'en' }
  readonly head = {
    appendChild: (element: HTMLLinkElement) => {
      this.appendedLinks.push(element as unknown as MockLinkElement)
      return element
    }
  }

  constructor(
    private readonly scripts: Map<string, MockScriptElement>,
    private readonly demoRoots: MockDemoRoot[] = []
  ) {}

  getElementById(id: string) {
    return this.scripts.get(id) ?? null
  }

  createElement() {
    return new MockLinkElement() as unknown as HTMLLinkElement
  }

  querySelector(selector: string) {
    if (!selector.startsWith('link[')) {
      return null
    }

    const attrMatch = selector.match(/\[([^=\]]+)(?:="([^"]*)")?\]/)
    if (!attrMatch) {
      return null
    }

    const [, attrName, attrValue] = attrMatch
    return (
      this.appendedLinks.find((link) => {
        const value = link.getAttribute(attrName)
        if (attrValue === undefined) {
          return value !== null
        }
        return value === attrValue
      }) ?? null
    )
  }

  querySelectorAll(selector?: string) {
    if (selector === '[data-home-demo-root]') {
      return this.demoRoots
    }
    return []
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  dispatchEvent(event: Event) {
    this.listeners.get(event.type)?.forEach((listener) => listener(event))
    return true
  }
}

class MockLinkElement {
  rel = ''
  sheet: unknown = null
  private readonly attrs = new Map<string, string>()
  private readonly listeners = new Map<string, Set<() => void>>()

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
    if (name === 'rel') {
      this.rel = value
      if (value === 'stylesheet') {
        this.sheet = {}
      }
    }
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
    if (name === 'rel') {
      this.rel = ''
      this.sheet = null
    }
  }

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly observed = new Set<Element>()

  constructor(
    private readonly callback: IntersectionObserverCallback
  ) {
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed.add(target)
  }

  unobserve(target: Element) {
    this.observed.delete(target)
  }

  disconnect() {
    this.observed.clear()
  }

  emit(
    entries: Array<{
      target: Element
      isIntersecting: boolean
      intersectionRatio?: number
    }>
  ) {
    this.callback(
      entries.map((entry) => ({
        target: entry.target,
        isIntersecting: entry.isIntersecting,
        intersectionRatio: entry.intersectionRatio ?? (entry.isIntersecting ? 1 : 0)
      })) as IntersectionObserverEntry[],
      this as never
    )
  }

  static reset() {
    MockIntersectionObserver.instances.length = 0
  }
}

type MockWindow = Window & {
  __PROM_STATIC_HOME_DEMO_STARTUP__?: boolean
}

const createBootstrapDocument = (demoRoots: MockDemoRoot[] = []) =>
  new MockDocument(
    new Map([
      [
        STATIC_SHELL_SEED_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            currentPath: '/',
            snapshotKey: '/',
            isAuthenticated: false,
            lang: 'en',
            languageSeed: {}
          })
        )
      ],
      [
        STATIC_HOME_DATA_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            path: '/',
            lang: 'en',
            fragmentOrder: [],
            fragmentVersions: {},
            languageSeed: {},
            homeDemoAssets: {}
          })
        )
      ]
    ]),
    demoRoots
  )

const createScheduledTaskQueue = () => {
  const callbacks: Array<() => void> = []

  return {
    scheduleTask(callback: () => void) {
      callbacks.push(callback)
      return () => {
        const index = callbacks.indexOf(callback)
        if (index >= 0) {
          callbacks.splice(index, 1)
        }
      }
    },
    runNext() {
      const callback = callbacks.shift()
      callback?.()
    },
    size() {
      return callbacks.length
    }
  }
}

const createController = (): HomeDemoController => ({
  path: '/',
  lang: 'en',
  fragmentOrder: [],
  planSignature: 'plan:test',
  versionSignature: 'version:test',
  assets: normalizeHomeDemoAssetMap(),
  demoRenders: new Map(),
  pendingDemoRoots: new Set(),
  activationEpoch: 0,
  destroyed: false
})

afterEach(() => {
  clearHomeDemoControllerBinding()
  MockIntersectionObserver.reset()
})

describe('installHomeDemoStartupEntry', () => {
  it('creates the startup controller binding and only runs the visible attach pass on startup', () => {
    const win = {} as MockWindow
    const doc = createBootstrapDocument()
    const taskQueue = createScheduledTaskQueue()
    const observedRoots: Array<{ root: ParentNode; startup?: boolean }> = []
    let observerBundleLoadCount = 0

    const cleanup = installHomeDemoStartupEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never,
      loadObserverRuntime: async () => {
        observerBundleLoadCount += 1
        return {
          installHomeDemoEntry: () => () => undefined
        }
      }
    })

    const binding = getHomeDemoControllerBinding(win)
    expect(binding).not.toBeNull()
    binding!.manager = {
      ...binding!.manager,
      observeWithin: (root, options) => {
        observedRoots.push({ root, startup: options?.startup })
      },
      attachVisibleRoots: () => undefined
    } satisfies HomeDemoActivationManager

    expect(taskQueue.size()).toBe(1)

    taskQueue.runNext()
    expect(observedRoots).toEqual([
      { root: doc as unknown as ParentNode, startup: true }
    ])
    expect(observerBundleLoadCount).toBe(0)

    cleanup()
    expect(win.__PROM_STATIC_HOME_DEMO_STARTUP__).toBe(false)
    expect(getHomeDemoControllerBinding(win)).toBeNull()
  })

  it('reuses an existing controller binding without replacing it', () => {
    const win = {} as MockWindow
    const doc = createBootstrapDocument()
    const taskQueue = createScheduledTaskQueue()
    const existingController = createController()
    const observedRoots: Array<{ root: ParentNode; startup?: boolean }> = []

    setHomeDemoControllerBinding(
      {
        controller: existingController,
        manager: {
          observeWithin: (root, options) => observedRoots.push({ root, startup: options?.startup }),
          attachVisibleRoots: () => undefined,
          destroy: () => undefined
        } satisfies HomeDemoActivationManager
      },
      win
    )

    const cleanup = installHomeDemoStartupEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never
    })

    taskQueue.runNext()
    expect(observedRoots).toEqual([
      { root: doc as unknown as ParentNode, startup: true }
    ])
    expect(getHomeDemoControllerBinding(win)?.controller).toBe(existingController)

    cleanup()
    expect(getHomeDemoControllerBinding(win)?.controller).toBe(existingController)
  })

  it('attaches visible startup demos from IntersectionObserver through the shared startup attach runtime', async () => {
    const win = {} as MockWindow
    const plannerRoot = new MockDemoRoot('planner')
    const reactRoot = new MockDemoRoot('react-binary')
    const doc = createBootstrapDocument([plannerRoot, reactRoot])
    const taskQueue = createScheduledTaskQueue()
    const activations: string[] = []
    let startupAttachLoadCount = 0
    let startupRuntimePromise:
      | Promise<{
          attachHomeDemo: ({
            root,
            kind,
          }: {
            root: Element
            kind: string
          }) => Promise<{ cleanup: () => void }>
        }>
      | null = null

    setHomeDemoControllerBinding(
      {
        controller: createController(),
        manager: {
          observeWithin: () => undefined,
          attachVisibleRoots: () => undefined,
          destroy: () => undefined
        } satisfies HomeDemoActivationManager
      },
      win
    )

    installHomeDemoStartupEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never,
      loadStartupAttachRuntime: async () => {
        if (!startupRuntimePromise) {
          startupAttachLoadCount += 1
          startupRuntimePromise = Promise.resolve({
            attachHomeDemo: async ({ root, kind }) => {
              ;(root as MockDemoRoot).setAttribute('data-home-demo-active', 'true')
              activations.push(kind)
              return {
                cleanup: () => undefined
              }
            }
          })
        }
        return await startupRuntimePromise
      },
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver
    })

    taskQueue.runNext()
    expect(activations).toEqual([])

    MockIntersectionObserver.instances[1]?.emit([
      { target: plannerRoot as unknown as Element, isIntersecting: true },
      { target: reactRoot as unknown as Element, isIntersecting: true }
    ])

    await Promise.resolve()
    await Promise.resolve()

    expect(startupAttachLoadCount).toBe(1)
    expect(activations).toEqual(['planner', 'react-binary'])
  })

  it('loads the maintenance runtime only when an inactive startup root enters the viewport', async () => {
    const win = {} as MockWindow
    const demoRoot = new MockDemoRoot('planner')
    demoRoot.setRect({
      top: 1280,
      left: 0,
      right: 320,
      bottom: 1520,
      width: 320,
      height: 240
    })
    const doc = createBootstrapDocument([demoRoot])
    const taskQueue = createScheduledTaskQueue()
    let observerBundleLoadCount = 0

    setHomeDemoControllerBinding(
      {
        controller: createController(),
        manager: {
          observeWithin: () => undefined,
          attachVisibleRoots: () => undefined,
          destroy: () => undefined
        } satisfies HomeDemoActivationManager
      },
      win
    )

    installHomeDemoStartupEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never,
      loadObserverRuntime: async () => {
        observerBundleLoadCount += 1
        return {
          installHomeDemoEntry: () => () => undefined
        }
      },
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver
    })

    taskQueue.runNext()
    expect(observerBundleLoadCount).toBe(0)

    MockIntersectionObserver.instances[0]?.emit([
      { target: demoRoot as unknown as Element, isIntersecting: true }
    ])

    await Promise.resolve()
    expect(observerBundleLoadCount).toBe(1)
  })

  it('re-attaches visible startup demos on observe requests without loading the maintenance bundle', () => {
    const win = {} as MockWindow
    const doc = createBootstrapDocument()
    const taskQueue = createScheduledTaskQueue()
    const observedRoots: Array<{ root: ParentNode; startup?: boolean }> = []
    let observerBundleLoadCount = 0

    installHomeDemoStartupEntry({
      win,
      doc: doc as never,
      scheduleTask: taskQueue.scheduleTask as never,
      loadObserverRuntime: async () => {
        observerBundleLoadCount += 1
        return {
          installHomeDemoEntry: () => () => undefined
        }
      }
    })

    const binding = getHomeDemoControllerBinding(win)
    binding!.manager = {
      ...binding!.manager,
      observeWithin: (root, options) => {
        observedRoots.push({ root, startup: options?.startup })
      },
      attachVisibleRoots: () => undefined
    } satisfies HomeDemoActivationManager

    taskQueue.runNext()
    const patchedRoot = {} as ParentNode
    doc.dispatchEvent(
      new CustomEvent(HOME_DEMO_OBSERVE_EVENT, {
        detail: { root: patchedRoot }
      })
    )

    expect(observedRoots).toEqual([
      { root: doc as unknown as ParentNode, startup: true },
      { root: patchedRoot, startup: true }
    ])
    expect(observerBundleLoadCount).toBe(0)
  })
})

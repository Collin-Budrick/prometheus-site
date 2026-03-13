import { afterEach, describe, expect, it } from 'bun:test'
import {
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PAINT_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR
} from './constants'
import {
  bindHomeFragmentHydration,
  bindHomeDemoActivation,
  scheduleHomePostLcpTasks,
  scheduleStaticHomePaintReady,
  type HomeDemoController
} from './home-bootstrap'
import type { HomeFirstLcpGate } from './home-lcp-gate'

class MockDemoElement {
  dataset: Record<string, string> = {}
  isConnected = true
  private attrs = new Map<string, string>()

  constructor(kind: string, props?: Record<string, unknown>) {
    this.dataset.homeDemoRoot = kind
    this.dataset.demoKind = kind
    if (props) {
      this.setAttribute('data-demo-props', JSON.stringify(props))
    }
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  closest() {
    return null
  }
}

class MockRoot {
  constructor(private readonly demoRoots: MockDemoElement[]) {}

  querySelectorAll<T>() {
    return this.demoRoots as unknown as T[]
  }
}

class MockStaticHomeRoot {
  private attrs = new Map<string, string>([
    ['data-static-home-root', 'true'],
    [STATIC_HOME_PAINT_ATTR, 'initial']
  ])

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }
}

class MockStaticHomeDocumentRoot extends MockStaticHomeRoot {
  constructor(private readonly cards: MockFragmentCard[]) {
    super()
  }

  querySelectorAll<T>() {
    return this.cards as unknown as T[]
  }
}

class MockFragmentCard {
  dataset: Record<string, string> = {}
  isConnected = true
  private attrs = new Map<string, string>([['data-static-fragment-card', 'true']])

  constructor(
    id: string,
    stage: 'anchor' | 'deferred',
    patchState: 'pending' | 'ready' = 'pending',
    kind: 'planner' | 'ledger' | 'island' | 'react' | 'dock' = 'planner'
  ) {
    this.dataset.fragmentId = id
    this.setAttribute(STATIC_HOME_STAGE_ATTR, stage)
    this.setAttribute(STATIC_HOME_PATCH_STATE_ATTR, patchState)
    this.setAttribute(STATIC_HOME_FRAGMENT_KIND_ATTR, kind)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly observed = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {
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

  emit(entries: Array<{ target: Element; isIntersecting: boolean; intersectionRatio?: number }>) {
    this.callback(
      entries.map(
        ({ target, isIntersecting, intersectionRatio }) =>
          ({
            target,
            isIntersecting,
            intersectionRatio: typeof intersectionRatio === 'number' ? intersectionRatio : isIntersecting ? 1 : 0
          }) as IntersectionObserverEntry
      ),
      this as unknown as IntersectionObserver
    )
  }

  static reset() {
    MockIntersectionObserver.instances.length = 0
  }
}

const createController = (): HomeDemoController => ({
  demoRenders: new Map(),
  pendingDemoRoots: new Set(),
  destroyed: false
})

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const createManualLcpGate = () => {
  let resolveWait!: () => void
  let cleanupCount = 0
  const gate: HomeFirstLcpGate = {
    wait: new Promise<void>((resolve) => {
      resolveWait = resolve
    }),
    cleanup: () => {
      cleanupCount += 1
    }
  }

  return {
    gate,
    resolve: () => resolveWait(),
    cleanupCount: () => cleanupCount
  }
}

type MockWindowListener = (event?: unknown) => void

class MockDeferredWindow {
  private readonly listeners = new Map<string, Set<MockWindowListener>>()
  readonly timeouts = new Map<number, () => void>()
  readonly idleCallbacks = new Map<number, () => void>()
  nextTimeoutId = 1
  nextIdleId = 1

  addEventListener(type: string, listener: MockWindowListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockWindowListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  setTimeout(callback: () => void) {
    const id = this.nextTimeoutId
    this.nextTimeoutId += 1
    this.timeouts.set(id, callback)
    return id as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout(id: ReturnType<typeof setTimeout>) {
    this.timeouts.delete(id as unknown as number)
  }

  requestIdleCallback(callback: IdleRequestCallback) {
    const id = this.nextIdleId
    this.nextIdleId += 1
    this.idleCallbacks.set(id, () =>
      callback({
        didTimeout: false,
        timeRemaining: () => 50
      } as IdleDeadline)
    )
    return id
  }

  cancelIdleCallback(id: number) {
    this.idleCallbacks.delete(id)
  }

  emit(type: string, event?: unknown) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }

  runIdle(id = 1) {
    const callback = this.idleCallbacks.get(id)
    if (!callback) return
    this.idleCallbacks.delete(id)
    callback()
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
}

class MockDeferredDocument {
  visibilityState: DocumentVisibilityState = 'visible'
  private readonly listeners = new Map<string, Set<MockWindowListener>>()

  addEventListener(type: string, listener: MockWindowListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: MockWindowListener) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) {
      this.listeners.delete(type)
    }
  }

  emit(type: string, event?: unknown) {
    ;(this.listeners.get(type) ?? new Set()).forEach((listener) => listener(event))
  }

  setVisibility(state: DocumentVisibilityState) {
    this.visibilityState = state
    this.emit('visibilitychange')
  }
}

const createHomeBootstrapController = () => ({
  destroyed: false,
  isAuthenticated: false,
  lang: 'en' as const,
  path: '/',
  homeDemoStylesheetHref: null,
  homeFragmentBootstrapHref: null,
  fetchAbort: null,
  cleanupFns: [],
  demoRenders: new Map(),
  pendingDemoRoots: new Set(),
  demoObservationReady: false,
  patchQueue: null
})

const createHomeFragmentPayload = (id: string) =>
  ({
    id,
    meta: { cacheKey: `${id}:1` },
    head: [],
    css: '',
    cacheUpdatedAt: 1,
    tree: { type: 'element', tag: 'section', attrs: {}, children: [] }
  }) as const

const createTaskQueue = () => {
  const tasks: Array<{ callback: () => void; cancelled: boolean }> = []

  return {
    scheduleTask: ((callback: () => void) => {
      const task = { callback, cancelled: false }
      tasks.push(task)
      return () => {
        task.cancelled = true
      }
    }) as typeof import('./scheduler').scheduleStaticShellTask,
    pendingCount: () => tasks.filter((task) => !task.cancelled).length,
    flushNext: async () => {
      while (tasks.length > 0) {
        const task = tasks.shift()
        if (!task || task.cancelled) continue
        task.callback()
        await flushMicrotasks()
        return
      }
    }
  }
}

const createAnimationFrameQueue = () => {
  let nextId = 1
  const frames = new Map<number, FrameRequestCallback>()

  return {
    requestFrame: ((callback: FrameRequestCallback) => {
      const id = nextId
      nextId += 1
      frames.set(id, callback)
      return id
    }) as typeof requestAnimationFrame,
    cancelFrame: ((id: number) => {
      frames.delete(id)
    }) as typeof cancelAnimationFrame,
    pendingCount: () => frames.size,
    flushNext: () => {
      const nextEntry = frames.entries().next()
      if (nextEntry.done) return
      const [id, callback] = nextEntry.value
      frames.delete(id)
      callback(0)
    }
  }
}

afterEach(() => {
  MockIntersectionObserver.reset()
})

describe('bindHomeDemoActivation', () => {
  it('does not activate home demos until they become visible and activates them one task at a time in order', async () => {
    const taskQueue = createTaskQueue()
    const activations: Array<{ kind: string; props: Record<string, unknown> }> = []
    const controller = createController()
    const planner = new MockDemoElement('planner')
    const island = new MockDemoElement('preact-island', { label: 'Mission clock' })
    const manager = bindHomeDemoActivation({
      controller,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      activate: async ({ kind, props }) => {
        activations.push({ kind, props })
        return { cleanup: () => undefined }
      }
    })

    manager.observeWithin(new MockRoot([planner, island]) as unknown as ParentNode)

    expect(activations).toEqual([])
    expect(taskQueue.pendingCount()).toBe(0)

    const observer = MockIntersectionObserver.instances[0]
    expect(observer).toBeDefined()

    observer?.emit([
      { target: planner as unknown as Element, isIntersecting: true },
      { target: island as unknown as Element, isIntersecting: true }
    ])

    expect(taskQueue.pendingCount()).toBe(1)
    expect(activations).toEqual([])

    await taskQueue.flushNext()

    expect(activations).toEqual([{ kind: 'planner', props: {} }])
    expect(taskQueue.pendingCount()).toBe(1)

    await taskQueue.flushNext()

    expect(activations).toEqual([
      { kind: 'planner', props: {} },
      { kind: 'preact-island', props: { label: 'Mission clock' } }
    ])
  })

  it('cleans up detached demos and activates replacement roots after a patch or language swap', async () => {
    const taskQueue = createTaskQueue()
    const activations: Array<{ kind: string; props: Record<string, unknown> }> = []
    const cleanups: string[] = []
    const controller = createController()
    const englishIsland = new MockDemoElement('preact-island', { label: 'Mission clock' })
    const manager = bindHomeDemoActivation({
      controller,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      activate: async ({ kind, props }) => {
        activations.push({ kind, props })
        const label = typeof props.label === 'string' ? props.label : 'unknown'
        return { cleanup: () => cleanups.push(`cleanup:${kind}:${label}`) }
      }
    })

    manager.observeWithin(new MockRoot([englishIsland]) as unknown as ParentNode)
    const observer = MockIntersectionObserver.instances[0]
    observer?.emit([{ target: englishIsland as unknown as Element, isIntersecting: true }])
    await taskQueue.flushNext()

    englishIsland.isConnected = false
    const japaneseIsland = new MockDemoElement('preact-island', { label: 'Orbital timer' })
    manager.observeWithin(new MockRoot([japaneseIsland]) as unknown as ParentNode)

    expect(cleanups).toEqual(['cleanup:preact-island:Mission clock'])

    observer?.emit([{ target: japaneseIsland as unknown as Element, isIntersecting: true }])
    await taskQueue.flushNext()

    expect(activations).toEqual([
      { kind: 'preact-island', props: { label: 'Mission clock' } },
      { kind: 'preact-island', props: { label: 'Orbital timer' } }
    ])
    expect(controller.demoRenders.has(japaneseIsland as unknown as Element)).toBe(true)
  })

  it('does not double-activate the same root on repeated visibility events', async () => {
    const taskQueue = createTaskQueue()
    const controller = createController()
    const planner = new MockDemoElement('planner')
    let activationCount = 0
    const manager = bindHomeDemoActivation({
      controller,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      activate: async () => {
        activationCount += 1
        return { cleanup: () => undefined }
      }
    })

    manager.observeWithin(new MockRoot([planner]) as unknown as ParentNode)
    const observer = MockIntersectionObserver.instances[0]

    observer?.emit([{ target: planner as unknown as Element, isIntersecting: true }])
    await taskQueue.flushNext()

    observer?.emit([{ target: planner as unknown as Element, isIntersecting: true }])
    manager.observeWithin(new MockRoot([planner]) as unknown as ParentNode)
    await taskQueue.flushNext()

    expect(activationCount).toBe(1)
    expect(taskQueue.pendingCount()).toBe(0)
  })

  it('does not activate demos that are only barely intersecting', async () => {
    const taskQueue = createTaskQueue()
    const controller = createController()
    const planner = new MockDemoElement('planner')
    let activationCount = 0
    const manager = bindHomeDemoActivation({
      controller,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      activate: async () => {
        activationCount += 1
        return { cleanup: () => undefined }
      }
    })

    manager.observeWithin(new MockRoot([planner]) as unknown as ParentNode)
    const observer = MockIntersectionObserver.instances[0]

    observer?.emit([{ target: planner as unknown as Element, isIntersecting: true, intersectionRatio: 0.1 }])
    expect(taskQueue.pendingCount()).toBe(0)

    observer?.emit([{ target: planner as unknown as Element, isIntersecting: true, intersectionRatio: 0.2 }])
    expect(taskQueue.pendingCount()).toBe(1)

    await taskQueue.flushNext()

    expect(activationCount).toBe(1)
  })
})

describe('scheduleStaticHomePaintReady', () => {
  it('flips the home paint attribute to ready only after two animation frames', () => {
    const frameQueue = createAnimationFrameQueue()
    const root = new MockStaticHomeRoot()

    const cleanup = scheduleStaticHomePaintReady({
      root: root as unknown as Element,
      requestFrame: frameQueue.requestFrame,
      cancelFrame: frameQueue.cancelFrame
    })

    expect(root.getAttribute(STATIC_HOME_PAINT_ATTR)).toBe('initial')
    expect(frameQueue.pendingCount()).toBe(1)

    frameQueue.flushNext()
    expect(root.getAttribute(STATIC_HOME_PAINT_ATTR)).toBe('initial')
    expect(frameQueue.pendingCount()).toBe(1)

    frameQueue.flushNext()
    expect(root.getAttribute(STATIC_HOME_PAINT_ATTR)).toBe('ready')

    cleanup()
  })
})

describe('scheduleHomePostLcpTasks', () => {
  it('arms deferred revalidation and demo observation only after the LCP gate resolves', async () => {
    const manualGate = createManualLcpGate()
    const win = new MockDeferredWindow()
    const doc = new MockDeferredDocument()
    const observedRoots: ParentNode[] = []
    const previewRefreshCalls: string[] = []
    const authRefreshCalls: string[] = []
    const cleanup = scheduleHomePostLcpTasks({
      controller: createHomeBootstrapController(),
      lcpGate: manualGate.gate,
      homeDemoActivation: {
        observeWithin: (root) => observedRoots.push(root)
      },
      homeFragmentHydration: {
        schedulePreviewRefreshes: () => previewRefreshCalls.push('refresh'),
        retryPending: () => previewRefreshCalls.push('retry')
      },
      root: {} as ParentNode,
      win: win as never,
      doc: doc as never,
      refreshAuth: async () => {
        authRefreshCalls.push('refresh')
      }
    })

    await flushMicrotasks()

    expect(observedRoots).toEqual([])
    expect(previewRefreshCalls).toEqual([])
    expect(authRefreshCalls).toEqual([])
    expect(win.idleCallbacks.size).toBe(0)

    manualGate.resolve()
    await flushMicrotasks()

    expect(observedRoots).toEqual([])
    expect(previewRefreshCalls).toEqual([])
    expect(authRefreshCalls).toEqual([])
    expect(win.idleCallbacks.size).toBe(1)
    expect(win.timeouts.size).toBe(0)
    expect(win.listenerCount('pageshow')).toBe(1)

    cleanup()
    expect(manualGate.cleanupCount()).toBe(1)
    expect(win.listenerCount('pageshow')).toBe(0)
  })

  it('runs deferred revalidation on first user intent after the LCP gate resolves', async () => {
    const manualGate = createManualLcpGate()
    const win = new MockDeferredWindow()
    const doc = new MockDeferredDocument()
    const previewRefreshCalls: string[] = []
    const authRefreshCalls: string[] = []
    const cleanup = scheduleHomePostLcpTasks({
      controller: createHomeBootstrapController(),
      lcpGate: manualGate.gate,
      homeDemoActivation: {
        observeWithin: () => undefined
      },
      homeFragmentHydration: {
        schedulePreviewRefreshes: () => previewRefreshCalls.push('refresh'),
        retryPending: () => undefined
      },
      win: win as never,
      doc: doc as never,
      refreshAuth: async () => {
        authRefreshCalls.push('refresh')
      }
    })

    manualGate.resolve()
    await flushMicrotasks()

    win.emit('pointerdown')
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual(['refresh'])
    expect(authRefreshCalls).toEqual(['refresh'])

    win.emit('keydown')
    win.runIdle()
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual(['refresh'])
    expect(authRefreshCalls).toEqual(['refresh'])
    cleanup()
  })

  it('runs deferred revalidation from the idle fallback when there is no user intent', async () => {
    const manualGate = createManualLcpGate()
    const win = new MockDeferredWindow()
    const doc = new MockDeferredDocument()
    const previewRefreshCalls: string[] = []
    const authRefreshCalls: string[] = []
    const cleanup = scheduleHomePostLcpTasks({
      controller: createHomeBootstrapController(),
      lcpGate: manualGate.gate,
      homeDemoActivation: {
        observeWithin: () => undefined
      },
      homeFragmentHydration: {
        schedulePreviewRefreshes: () => previewRefreshCalls.push('refresh'),
        retryPending: () => undefined
      },
      win: win as never,
      doc: doc as never,
      refreshAuth: async () => {
        authRefreshCalls.push('refresh')
      }
    })

    manualGate.resolve()
    await flushMicrotasks()
    win.runIdle()
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual(['refresh'])
    expect(authRefreshCalls).toEqual(['refresh'])
    cleanup()
  })

  it('runs deferred revalidation when the page becomes visible again before it starts', async () => {
    const manualGate = createManualLcpGate()
    const win = new MockDeferredWindow()
    const doc = new MockDeferredDocument()
    const previewRefreshCalls: string[] = []
    const authRefreshCalls: string[] = []
    const cleanup = scheduleHomePostLcpTasks({
      controller: createHomeBootstrapController(),
      lcpGate: manualGate.gate,
      homeDemoActivation: {
        observeWithin: () => undefined
      },
      homeFragmentHydration: {
        schedulePreviewRefreshes: () => previewRefreshCalls.push('refresh'),
        retryPending: () => undefined
      },
      win: win as never,
      doc: doc as never,
      refreshAuth: async () => {
        authRefreshCalls.push('refresh')
      }
    })

    doc.setVisibility('hidden')
    manualGate.resolve()
    await flushMicrotasks()
    win.runIdle()
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual([])
    expect(authRefreshCalls).toEqual([])

    doc.setVisibility('visible')
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual(['refresh'])
    expect(authRefreshCalls).toEqual(['refresh'])
    cleanup()
  })

  it('retries pending hydration and revalidates auth on persisted pageshow', async () => {
    const manualGate = createManualLcpGate()
    const win = new MockDeferredWindow()
    const doc = new MockDeferredDocument()
    const previewRefreshCalls: string[] = []
    const retryCalls: string[] = []
    const authRefreshCalls: string[] = []
    const cleanup = scheduleHomePostLcpTasks({
      controller: createHomeBootstrapController(),
      lcpGate: manualGate.gate,
      homeDemoActivation: {
        observeWithin: () => undefined
      },
      homeFragmentHydration: {
        schedulePreviewRefreshes: () => previewRefreshCalls.push('refresh'),
        retryPending: () => retryCalls.push('retry')
      },
      win: win as never,
      doc: doc as never,
      refreshAuth: async () => {
        authRefreshCalls.push('refresh')
      }
    })

    manualGate.resolve()
    await flushMicrotasks()

    win.emit('pageshow', { persisted: true } as PageTransitionEvent)
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual(['refresh'])
    expect(retryCalls).toEqual(['retry'])
    expect(authRefreshCalls).toEqual(['refresh'])

    win.emit('pageshow', { persisted: true } as PageTransitionEvent)
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual(['refresh'])
    expect(retryCalls).toEqual(['retry', 'retry'])
    expect(authRefreshCalls).toEqual(['refresh', 'refresh'])
    cleanup()
  })

  it('cancels pending deferred revalidation triggers during cleanup', async () => {
    const manualGate = createManualLcpGate()
    const win = new MockDeferredWindow()
    const doc = new MockDeferredDocument()
    const previewRefreshCalls: string[] = []
    const authRefreshCalls: string[] = []
    const cleanup = scheduleHomePostLcpTasks({
      controller: createHomeBootstrapController(),
      lcpGate: manualGate.gate,
      homeDemoActivation: {
        observeWithin: () => undefined
      },
      homeFragmentHydration: {
        schedulePreviewRefreshes: () => previewRefreshCalls.push('refresh'),
        retryPending: () => undefined
      },
      win: win as never,
      doc: doc as never,
      refreshAuth: async () => {
        authRefreshCalls.push('refresh')
      }
    })

    manualGate.resolve()
    await flushMicrotasks()
    cleanup()

    win.emit('pointerdown')
    win.runIdle()
    win.emit('pageshow', { persisted: true } as PageTransitionEvent)
    await flushMicrotasks()

    expect(previewRefreshCalls).toEqual([])
    expect(authRefreshCalls).toEqual([])
    expect(manualGate.cleanupCount()).toBe(1)
  })
})

describe('bindHomeFragmentHydration', () => {
  it('schedules anchor hydration only after the home paint attribute flips to ready', async () => {
    const frameQueue = createAnimationFrameQueue()
    const taskQueue = createTaskQueue()
    const anchor = new MockFragmentCard('fragment://page/home/planner@v1', 'anchor')
    const deferred = new MockFragmentCard('fragment://page/home/ledger@v1', 'deferred')
    const root = new MockStaticHomeDocumentRoot([anchor, deferred])
    const fetchCalls: string[][] = []
    const enqueued: string[] = []
    const hydration = bindHomeFragmentHydration({
      controller: {
        destroyed: false,
        lang: 'en',
        fetchAbort: null,
        patchQueue: {
          enqueue: (payload) => enqueued.push(payload.id),
          setVisible: () => undefined,
          flushNow: () => undefined,
          destroy: () => undefined
        }
      },
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      fetchBatch: async (ids) => {
        fetchCalls.push(ids)
        return Object.fromEntries(ids.map((id) => [id, createHomeFragmentPayload(id)]))
      }
    })

    const cleanup = scheduleStaticHomePaintReady({
      root: root as unknown as Element,
      requestFrame: frameQueue.requestFrame,
      cancelFrame: frameQueue.cancelFrame,
      onReady: () => hydration.scheduleAnchorHydration()
    })

    expect(fetchCalls).toEqual([])
    expect(taskQueue.pendingCount()).toBe(0)

    frameQueue.flushNext()
    expect(root.getAttribute(STATIC_HOME_PAINT_ATTR)).toBe('initial')
    expect(taskQueue.pendingCount()).toBe(0)

    frameQueue.flushNext()
    expect(root.getAttribute(STATIC_HOME_PAINT_ATTR)).toBe('ready')
    expect(taskQueue.pendingCount()).toBe(1)

    await taskQueue.flushNext()
    await flushMicrotasks()

    expect(fetchCalls).toEqual([['fragment://page/home/planner@v1']])
    expect(enqueued).toEqual(['fragment://page/home/planner@v1'])

    cleanup()
    hydration.destroy()
  })

  it('starts the home demo stylesheet load before patching fetched home fragments', async () => {
    const taskQueue = createTaskQueue()
    const anchor = new MockFragmentCard('fragment://page/home/planner@v1', 'anchor')
    const root = new MockStaticHomeDocumentRoot([anchor])
    root.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    const callOrder: string[] = []
    const enqueued: string[] = []
    let resolveStylesheet!: () => void
    const stylesheetReady = new Promise<void>((resolve) => {
      resolveStylesheet = () => {
        callOrder.push('stylesheet:ready')
        resolve()
      }
    })
    const hydration = bindHomeFragmentHydration({
      controller: {
        destroyed: false,
        lang: 'en',
        homeDemoStylesheetHref: '/assets/home-static-deferred.css',
        fetchAbort: null,
        patchQueue: {
          enqueue: (payload) => enqueued.push(payload.id),
          setVisible: () => undefined,
          flushNow: () => undefined,
          destroy: () => undefined
        }
      },
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      ensureDemoStylesheet: async () => {
        callOrder.push('stylesheet:start')
        await stylesheetReady
      },
      fetchBatch: async (ids) => {
        callOrder.push('fetch:start')
        return Object.fromEntries(ids.map((id) => [id, createHomeFragmentPayload(id)]))
      }
    })

    hydration.scheduleAnchorHydration()
    expect(taskQueue.pendingCount()).toBe(1)

    await taskQueue.flushNext()
    await flushMicrotasks()

    expect(callOrder).toEqual(['stylesheet:start', 'fetch:start'])
    expect(enqueued).toEqual([])

    resolveStylesheet()
    await flushMicrotasks()

    expect(callOrder).toEqual(['stylesheet:start', 'fetch:start', 'stylesheet:ready'])
    expect(enqueued).toEqual(['fragment://page/home/planner@v1'])

    hydration.destroy()
  })

  it('does not fetch deferred cards until they become visible', async () => {
    const taskQueue = createTaskQueue()
    const deferred = new MockFragmentCard('fragment://page/home/ledger@v1', 'deferred')
    const root = new MockStaticHomeDocumentRoot([deferred])
    root.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    const fetchCalls: string[][] = []
    const visibility: Array<{ id: string; visible: boolean }> = []
    const hydration = bindHomeFragmentHydration({
      controller: {
        destroyed: false,
        lang: 'en',
        fetchAbort: null,
        patchQueue: {
          enqueue: () => undefined,
          setVisible: (id, visible) => visibility.push({ id, visible }),
          flushNow: () => undefined,
          destroy: () => undefined
        }
      },
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      fetchBatch: async (ids) => {
        fetchCalls.push(ids)
        return Object.fromEntries(ids.map((id) => [id, createHomeFragmentPayload(id)]))
      }
    })

    hydration.observeWithin(root as unknown as ParentNode)

    expect(fetchCalls).toEqual([])
    expect(taskQueue.pendingCount()).toBe(0)

    const observer = MockIntersectionObserver.instances[0]
    observer?.emit([{ target: deferred as unknown as Element, isIntersecting: true, intersectionRatio: 0.1 }])

    expect(visibility).toEqual([{ id: 'fragment://page/home/ledger@v1', visible: false }])
    expect(taskQueue.pendingCount()).toBe(0)

    observer?.emit([{ target: deferred as unknown as Element, isIntersecting: true, intersectionRatio: 0.2 }])

    expect(visibility).toEqual([
      { id: 'fragment://page/home/ledger@v1', visible: false },
      { id: 'fragment://page/home/ledger@v1', visible: true }
    ])
    expect(taskQueue.pendingCount()).toBe(1)

    await taskQueue.flushNext()
    await flushMicrotasks()

    expect(fetchCalls).toEqual([['fragment://page/home/ledger@v1']])
    hydration.destroy()
  })

  it('retries hydration only for cards that are still pending', async () => {
    const taskQueue = createTaskQueue()
    const readyAnchor = new MockFragmentCard('fragment://page/home/planner@v1', 'anchor', 'ready')
    const pendingAnchor = new MockFragmentCard('fragment://page/home/ledger@v1', 'anchor', 'pending')
    const root = new MockStaticHomeDocumentRoot([readyAnchor, pendingAnchor])
    root.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    const fetchCalls: string[][] = []
    const hydration = bindHomeFragmentHydration({
      controller: {
        destroyed: false,
        lang: 'en',
        fetchAbort: null,
        patchQueue: {
          enqueue: () => undefined,
          setVisible: () => undefined,
          flushNow: () => undefined,
          destroy: () => undefined
        }
      },
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      fetchBatch: async (ids) => {
        fetchCalls.push(ids)
        return Object.fromEntries(ids.map((id) => [id, createHomeFragmentPayload(id)]))
      }
    })

    hydration.retryPending()
    await taskQueue.flushNext()
    await flushMicrotasks()

    expect(fetchCalls).toEqual([['fragment://page/home/ledger@v1']])
    hydration.destroy()
  })

  it('does not fetch seeded preview cards during the initial anchor hydration pass', () => {
    const taskQueue = createTaskQueue()
    const readyPlanner = new MockFragmentCard('fragment://page/home/planner@v1', 'anchor', 'ready', 'planner')
    const readyLedger = new MockFragmentCard('fragment://page/home/ledger@v1', 'deferred', 'ready', 'ledger')
    const root = new MockStaticHomeDocumentRoot([readyPlanner, readyLedger])
    root.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    const fetchCalls: string[][] = []
    const hydration = bindHomeFragmentHydration({
      controller: {
        destroyed: false,
        lang: 'en',
        fetchAbort: null,
        patchQueue: {
          enqueue: () => undefined,
          setVisible: () => undefined,
          flushNow: () => undefined,
          destroy: () => undefined
        }
      },
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      fetchBatch: async (ids) => {
        fetchCalls.push(ids)
        return {}
      }
    })

    hydration.observeWithin(root as unknown as ParentNode)
    hydration.scheduleAnchorHydration()

    expect(taskQueue.pendingCount()).toBe(0)
    expect(fetchCalls).toEqual([])

    hydration.destroy()
  })

  it('refreshes seeded preview anchors only after preview refreshes are enabled', async () => {
    const taskQueue = createTaskQueue()
    const readyPlanner = new MockFragmentCard('fragment://page/home/planner@v1', 'anchor', 'ready', 'planner')
    const root = new MockStaticHomeDocumentRoot([readyPlanner])
    root.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    const fetchCalls: string[][] = []
    const hydration = bindHomeFragmentHydration({
      controller: {
        destroyed: false,
        lang: 'en',
        fetchAbort: null,
        patchQueue: {
          enqueue: () => undefined,
          setVisible: () => undefined,
          flushNow: () => undefined,
          destroy: () => undefined
        }
      },
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      fetchBatch: async (ids) => {
        fetchCalls.push(ids)
        return {}
      }
    })

    hydration.schedulePreviewRefreshes()
    expect(taskQueue.pendingCount()).toBe(1)

    await taskQueue.flushNext()
    await flushMicrotasks()

    expect(fetchCalls).toEqual([['fragment://page/home/planner@v1']])
    hydration.destroy()
  })

  it('does not refetch a dock card that is already marked ready', async () => {
    const taskQueue = createTaskQueue()
    const readyDock = new MockFragmentCard('fragment://page/home/dock@v2', 'deferred', 'ready', 'dock')
    const root = new MockStaticHomeDocumentRoot([readyDock])
    root.setAttribute(STATIC_HOME_PAINT_ATTR, 'ready')
    const fetchCalls: string[][] = []
    const hydration = bindHomeFragmentHydration({
      controller: {
        destroyed: false,
        lang: 'en',
        fetchAbort: null,
        patchQueue: {
          enqueue: () => undefined,
          setVisible: () => undefined,
          flushNow: () => undefined,
          destroy: () => undefined
        }
      },
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
      fetchBatch: async (ids) => {
        fetchCalls.push(ids)
        return Object.fromEntries(ids.map((id) => [id, createHomeFragmentPayload(id)]))
      }
    })

    hydration.observeWithin(root as unknown as ParentNode)
    hydration.retryPending()

    expect(taskQueue.pendingCount()).toBe(0)
    expect(fetchCalls).toEqual([])

    hydration.destroy()
  })
})

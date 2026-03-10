import { afterEach, describe, expect, it } from 'bun:test'
import { STATIC_HOME_PAINT_ATTR } from './constants'
import {
  bindHomeDemoActivation,
  scheduleStaticHomePaintReady,
  type HomeDemoController
} from './home-bootstrap'

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

  emit(entries: Array<{ target: Element; isIntersecting: boolean }>) {
    this.callback(
      entries.map(
        ({ target, isIntersecting }) =>
          ({
            target,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0
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

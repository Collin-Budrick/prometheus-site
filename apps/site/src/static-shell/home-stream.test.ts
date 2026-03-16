import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { h, t } from '@core/fragment/tree'
import type { FragmentPayload } from '@core/fragment/types'
import {
  READY_STAGGER_STATE_ATTR,
  resetReadyStaggerBatchesForTests
} from '@prometheus/ui/ready-stagger'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_STAGE_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR
} from './constants'
import { createStaticHomePatchQueue, patchStaticHomeFragmentCard } from './home-stream'

const unwrapTrustedHtml = (value: unknown) =>
  typeof value === 'object' && value !== null && '__html' in value
    ? String((value as { __html: unknown }).__html ?? '')
    : String(value ?? '')

class MockElement {
  dataset: Record<string, string> = {}
  isConnected = true
  style = (() => {
    const props = new Map<string, string>()
    return {
      height: '',
      setProperty: (name: string, value: string) => {
        props.set(name, value)
      },
      getPropertyValue: (name: string) => props.get(name) ?? ''
    }
  })()
  private html = ''
  private attrs = new Map<string, string>()
  private body: MockElement | null = null

  constructor(
    private readonly id?: string,
    private readonly writeLog?: string[]
  ) {}

  attachBody(body: MockElement) {
    this.body = body
  }

  set innerHTML(value: unknown) {
    this.html = unwrapTrustedHtml(value)
    this.recordWrite()
  }

  get innerHTML() {
    return this.html
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }

  get scrollHeight() {
    return 0
  }

  getBoundingClientRect() {
    return { width: 640, height: 489, top: 0, left: 0, right: 640, bottom: 489 }
  }

  querySelector<T>(selector: string) {
    if (selector.includes(STATIC_FRAGMENT_BODY_ATTR)) {
      return this.body as T | null
    }
    return null
  }

  querySelectorAll() {
    return []
  }

  dispatchEvent(_event: Event) {
    return true
  }

  protected recordWrite() {}
}

class MockBodyElement extends MockElement {
  protected override recordWrite() {
    const id = (this as unknown as { id?: string }).id
    const writeLog = (this as unknown as { writeLog?: string[] }).writeLog
    if (id && writeLog) {
      writeLog.push(id)
    }
  }
}

class MockRoot {
  constructor(private readonly cards: MockElement[]) {}

  querySelector<T>(selector: string) {
    const match = /data-fragment-id="([^"]+)"/.exec(selector)
    if (!match) return null
    return (this.cards.find((card) => card.dataset.fragmentId === match[1]) ?? null) as T | null
  }

  querySelectorAll<T>() {
    return this.cards as unknown as T[]
  }
}

const originalHTMLElement = (globalThis as typeof globalThis & { HTMLElement?: unknown }).HTMLElement
const originalTrustedTypes = (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

const createAnimationFrameQueue = () => {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 1

  return {
    requestFrame: ((callback: FrameRequestCallback) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    }) as typeof requestAnimationFrame,
    cancelFrame: ((id: number) => {
      callbacks.delete(id)
    }) as typeof cancelAnimationFrame,
    flushFrames: (count = 1) => {
      for (let index = 0; index < count; index += 1) {
        const frameCallbacks = Array.from(callbacks.values())
        callbacks.clear()
        frameCallbacks.forEach((callback) => callback(index * 16))
      }
    }
  }
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
    flushNext: () => {
      while (tasks.length > 0) {
        const task = tasks.shift()
        if (!task || task.cancelled) continue
        task.callback()
        return
      }
    }
  }
}

const flushAsyncWork = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const createPayload = (id: string, label: string, cacheUpdatedAt = 1) =>
  ({
    id,
    meta: {
      cacheKey: `${id}:${label}`
    },
    head: [],
    css: '',
    cacheUpdatedAt,
    tree: h('section', null, [h('p', null, [t(label)])])
  }) as unknown as FragmentPayload

const createCard = (
  fragmentId: string,
  log: string[],
  options: {
    critical?: boolean
    version?: number
    patchState?: 'pending' | 'ready'
    stage?: 'critical' | 'anchor' | 'deferred'
    readyStaggerState?: 'queued' | 'done'
    revealPhase?: 'holding' | 'queued' | 'visible'
    fragmentReady?: boolean
    fragmentStage?: string
  } = {}
) => {
  const body = new MockBodyElement(fragmentId, log)
  const card = new MockElement(fragmentId)
  card.dataset.fragmentId = fragmentId
  card.dataset.critical = options.critical ? 'true' : 'false'
  card.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${options.version ?? 1}`)
  card.setAttribute(STATIC_HOME_STAGE_ATTR, options.stage ?? (options.critical ? 'critical' : 'deferred'))
  card.setAttribute(STATIC_HOME_PATCH_STATE_ATTR, options.patchState ?? 'pending')
  if (options.readyStaggerState) {
    card.setAttribute(READY_STAGGER_STATE_ATTR, options.readyStaggerState)
  }
  if (options.revealPhase) {
    card.dataset.revealPhase = options.revealPhase
  }
  if (options.fragmentReady) {
    card.dataset.fragmentReady = 'true'
  }
  if (options.fragmentStage) {
    card.dataset.fragmentStage = options.fragmentStage
  }
  card.attachBody(body)
  return { card, body }
}

describe('home-stream patching', () => {
  let frameQueue: ReturnType<typeof createAnimationFrameQueue>
  const settlePatchedHeight = async () => undefined

  beforeEach(() => {
    frameQueue = createAnimationFrameQueue()
    ;(globalThis as typeof globalThis & { HTMLElement?: unknown }).HTMLElement =
      MockElement as unknown as typeof HTMLElement
    ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = {
      createPolicy: (name: string) => ({
        createHTML: (input: string) => ({ __html: input, policy: name })
      })
    }
    globalThis.requestAnimationFrame = frameQueue.requestFrame
    globalThis.cancelAnimationFrame = frameQueue.cancelFrame
  })

  afterEach(() => {
    resetReadyStaggerBatchesForTests()
    ;(globalThis as typeof globalThis & { HTMLElement?: unknown }).HTMLElement = originalHTMLElement
    if (originalTrustedTypes !== undefined) {
      ;(globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = originalTrustedTypes
    } else {
      delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes
    }
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
    } else {
      delete (globalThis as typeof globalThis).requestAnimationFrame
    }
    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    } else {
      delete (globalThis as typeof globalThis).cancelAnimationFrame
    }
  })

  it('keeps pending shells hidden until settle completes, then reveals them as whole cards', async () => {
    const log: string[] = []
    const { card, body } = createCard('fragment://page/home/planner@v1', log, {
      version: 5,
      patchState: 'pending'
    })

    const result = patchStaticHomeFragmentCard({
      lang: 'en',
      payload: createPayload('fragment://page/home/planner@v1', 'Patched planner', 5),
      applyEffects: false,
      settlePatchedHeight,
      card: card as unknown as HTMLElement
    })

    expect(result).toBe('patched')
    expect(body.innerHTML).toContain('Patched planner')
    expect(card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('ready')
    expect(card.dataset.revealPhase).toBe('holding')
    expect(card.dataset.fragmentReady).toBeUndefined()

    await flushAsyncWork()
    frameQueue.flushFrames()

    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(card.dataset.revealPhase).toBe('visible')
    expect(card.dataset.fragmentReady).toBe('true')
  })

  it('treats same-version ready cards as stale', () => {
    const log: string[] = []
    const { card, body } = createCard('fragment://page/home/react@v1', log, {
      version: 3,
      patchState: 'ready'
    })

    const result = patchStaticHomeFragmentCard({
      lang: 'en',
      payload: createPayload('fragment://page/home/react@v1', 'React update', 3),
      applyEffects: false,
      card: card as unknown as HTMLElement
    })

    expect(result).toBe('stale')
    expect(body.innerHTML).toBe('')
  })

  it('settles ready preview cards without waiting for the patch runtime loader', () => {
    const log: string[] = []
    const { card, body } = createCard('fragment://page/home/react@v1', log, {
      version: 1,
      patchState: 'ready',
      stage: 'anchor'
    })
    let settleCalls = 0

    const result = patchStaticHomeFragmentCard({
      lang: 'en',
      payload: createPayload('fragment://page/home/react@v1', 'React refresh', 2),
      applyEffects: false,
      settlePatchedHeight: async () => {
        settleCalls += 1
      },
      card: card as unknown as HTMLElement
    })

    expect(result).toBe('patched')
    expect(body.innerHTML).toContain('React refresh')
    expect(settleCalls).toBe(0)
  })

  it('keeps visible ready preview cards visible while refreshing their markup', async () => {
    const log: string[] = []
    const { card, body } = createCard('fragment://page/home/react@v1', log, {
      version: 1,
      patchState: 'ready',
      stage: 'anchor',
      readyStaggerState: 'done',
      revealPhase: 'visible',
      fragmentReady: true,
      fragmentStage: 'ready'
    })

    const result = patchStaticHomeFragmentCard({
      lang: 'en',
      payload: createPayload('fragment://page/home/react@v1', 'React refresh', 2),
      applyEffects: false,
      card: card as unknown as HTMLElement
    })

    expect(result).toBe('patched')
    expect(body.innerHTML).toContain('React refresh')
    expect(card.dataset.revealPhase).toBe('visible')
    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(card.dataset.fragmentReady).toBe('true')

    for (let index = 0; index < 5; index += 1) {
      frameQueue.flushFrames(1)
      await flushAsyncWork()
    }

    expect(card.dataset.revealPhase).toBe('visible')
    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(card.dataset.fragmentReady).toBe('true')
    expect(card.dataset.revealLocked).toBe('false')
  })

  it('coalesces payloads and patches one eligible card per scheduled task in DOM order', () => {
    const log: string[] = []
    const taskQueue = createTaskQueue()
    const planner = createCard('fragment://page/home/planner@v1', log, { stage: 'anchor' })
    const react = createCard('fragment://page/home/react@v1', log, { stage: 'deferred' })
    const root = new MockRoot([planner.card, react.card])
    const queue = createStaticHomePatchQueue({
      lang: 'en',
      applyEffects: false,
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      settlePatchedHeight
    })

    queue.setVisible('fragment://page/home/react@v1', true)
    queue.enqueue(createPayload('fragment://page/home/react@v1', 'React first', 2))
    queue.enqueue(createPayload('fragment://page/home/planner@v1', 'Planner first', 2))
    queue.enqueue(createPayload('fragment://page/home/planner@v1', 'Planner latest', 3))

    expect(taskQueue.pendingCount()).toBe(1)
    taskQueue.flushNext()

    expect(log).toEqual(['fragment://page/home/planner@v1'])
    expect(planner.body.innerHTML).toContain('Planner latest')
    expect(react.body.innerHTML).toBe('')
    expect(taskQueue.pendingCount()).toBe(1)

    taskQueue.flushNext()

    expect(log).toEqual(['fragment://page/home/planner@v1', 'fragment://page/home/react@v1'])
    expect(react.body.innerHTML).toContain('React first')
  })

  it('keeps ready preview cards marked ready while queued for refresh', () => {
    const log: string[] = []
    const taskQueue = createTaskQueue()
    const planner = createCard('fragment://page/home/planner@v1', log, {
      patchState: 'ready',
      stage: 'anchor',
      version: 1
    })
    const root = new MockRoot([planner.card])
    const queue = createStaticHomePatchQueue({
      lang: 'en',
      applyEffects: false,
      root: root as unknown as ParentNode,
      scheduleTask: taskQueue.scheduleTask,
      settlePatchedHeight
    })

    queue.enqueue(createPayload('fragment://page/home/planner@v1', 'Planner refresh', 2))

    expect(planner.card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('ready')
  })

  it('waits to patch demo cards until they become visible', () => {
    const log: string[] = []
    const ledger = createCard('fragment://page/home/ledger@v1', log)
    const root = new MockRoot([ledger.card])
    const queue = createStaticHomePatchQueue({
      lang: 'en',
      applyEffects: false,
      root: root as unknown as ParentNode,
      settlePatchedHeight
    })

    queue.enqueue(createPayload('fragment://page/home/ledger@v1', 'Ledger payload', 2))
    queue.flushNow()

    expect(ledger.body.innerHTML).toBe('')
    expect(ledger.card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('pending')

    queue.setVisible('fragment://page/home/ledger@v1', true)
    queue.flushNow()

    expect(ledger.body.innerHTML).toContain('Ledger payload')
    expect(ledger.card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('ready')
  })

  it('waits to patch non-demo cards until they become visible', () => {
    const log: string[] = []
    const dock = createCard('fragment://page/home/dock@v2', log)
    const root = new MockRoot([dock.card])
    const queue = createStaticHomePatchQueue({
      lang: 'en',
      applyEffects: false,
      root: root as unknown as ParentNode,
      settlePatchedHeight
    })

    queue.enqueue(createPayload('fragment://page/home/dock@v2', 'Dock payload', 2))
    queue.flushNow()

    expect(dock.body.innerHTML).toBe('')
    expect(dock.card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('pending')

    queue.setVisible('fragment://page/home/dock@v2', true)
    queue.flushNow()

    expect(dock.body.innerHTML).toContain('Dock payload')
    expect(dock.card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('ready')
  })
})

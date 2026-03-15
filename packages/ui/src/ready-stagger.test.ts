import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  READY_STAGGER_DELAY_VAR,
  READY_STAGGER_STATE_ATTR,
  claimReadyStaggerDelay,
  queueReadyStagger,
  queueReadyStaggerOnVisible,
  releaseQueuedReadyStaggerWithin,
  resetReadyStaggerBatchesForTests,
  resolveReadyStaggerDelay
} from './ready-stagger'

class MockStyle {
  private props = new Map<string, string>()

  setProperty(name: string, value: string) {
    this.props.set(name, value)
  }

  getPropertyValue(name: string) {
    return this.props.get(name) ?? ''
  }
}

class MockElement {
  isConnected = true
  style = new MockStyle()
  visible = true
  private attrs = new Map<string, string>()

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  getBoundingClientRect() {
    return this.visible
      ? { top: 0, left: 0, right: 320, bottom: 240 }
      : { top: 2000, left: 0, right: 320, bottom: 2240 }
  }
}

class MockRoot {
  constructor(private readonly elements: MockElement[]) {}

  querySelectorAll() {
    return this.elements
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly observed = new Set<object>()

  constructor(readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: object) {
    this.observed.add(target)
  }

  disconnect() {
    this.observed.clear()
  }

  emit(target: object, isIntersecting = true) {
    this.callback(
      [
        {
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0
        } as IntersectionObserverEntry
      ],
      this as never
    )
  }

  static reset() {
    MockIntersectionObserver.instances = []
  }
}

const originalWindow = globalThis.window
const originalDocument = globalThis.document

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & {
      window?: Pick<Window, 'innerWidth' | 'innerHeight' | 'matchMedia'>
      document?: Pick<Document, 'documentElement'>
    }
  ).window = {
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }) as MediaQueryList
  }
  ;(
    globalThis as typeof globalThis & {
      document?: Pick<Document, 'documentElement'>
    }
  ).document = {
    documentElement: {
      clientWidth: 1280,
      clientHeight: 800
    } as Document['documentElement']
  }
})

afterEach(() => {
  ;(
    globalThis as typeof globalThis & {
      window?: typeof globalThis.window
      document?: typeof globalThis.document
    }
  ).window = originalWindow
  ;(
    globalThis as typeof globalThis & {
      document?: typeof globalThis.document
    }
  ).document = originalDocument
  resetReadyStaggerBatchesForTests()
  MockIntersectionObserver.reset()
})

describe('ready stagger helpers', () => {
  it('caps stagger delays at 135ms', () => {
    expect(resolveReadyStaggerDelay(0)).toBe(0)
    expect(resolveReadyStaggerDelay(1)).toBe(45)
    expect(resolveReadyStaggerDelay(2)).toBe(90)
    expect(resolveReadyStaggerDelay(3)).toBe(135)
    expect(resolveReadyStaggerDelay(8)).toBe(135)
  })

  it('claims sequential delays per batch', () => {
    expect(claimReadyStaggerDelay({ group: 'cards' })).toBe(0)
    expect(claimReadyStaggerDelay({ group: 'cards' })).toBe(45)
    expect(claimReadyStaggerDelay({ group: 'cards' })).toBe(90)
  })

  it('queues and releases a card with the shared contract', () => {
    const card = new MockElement()
    let releaseCallback: FrameRequestCallback | null = null

    const delayMs = queueReadyStagger(card as unknown as HTMLElement, {
      group: 'cards',
      requestFrame: ((callback: FrameRequestCallback) => {
        releaseCallback = callback
        return 1
      }) as typeof requestAnimationFrame,
      win: null
    })

    expect(delayMs).toBe(0)
    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('queued')
    expect(card.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('0ms')

    releaseCallback?.(0)

    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
  })

  it('waits to release an offscreen card until it intersects', () => {
    const card = new MockElement()
    card.visible = false

    const delayMs = queueReadyStaggerOnVisible(card as unknown as HTMLElement, {
      group: 'cards',
      ObserverImpl: MockIntersectionObserver as never,
      requestFrame: ((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }) as typeof requestAnimationFrame,
      win: null
    })

    expect(delayMs).toBe(0)
    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('queued')
    expect(MockIntersectionObserver.instances).toHaveLength(1)

    card.visible = true
    MockIntersectionObserver.instances[0]?.emit(card as unknown as object)

    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
  })

  it('releases queued cards within a root in DOM order and defers offscreen cards', () => {
    const first = new MockElement()
    const second = new MockElement()
    const third = new MockElement()
    third.visible = false
    first.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    second.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    third.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    const root = new MockRoot([first, second, third])

    releaseQueuedReadyStaggerWithin({
      root: root as unknown as ParentNode,
      queuedSelector: '.fragment-card[data-ready-stagger-state="queued"]',
      group: 'cards',
      ObserverImpl: MockIntersectionObserver as never,
      requestFrame: ((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }) as typeof requestAnimationFrame,
      win: null
    })

    expect(first.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(second.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(third.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('queued')
    expect(first.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('0ms')
    expect(second.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('45ms')

    third.visible = true
    MockIntersectionObserver.instances[0]?.emit(third as unknown as object)

    expect(third.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(third.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('90ms')
  })
})

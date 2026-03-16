import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  READY_STAGGER_DELAY_VAR,
  READY_STAGGER_STATE_ATTR,
  claimReadyStaggerDelay,
  queueReadyStagger,
  queueReadyStaggerOnVisible,
  releaseQueuedReadyStaggerWithin,
  scheduleReleaseQueuedReadyStaggerWithin,
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
  throwOnMeasure = false
  top = 0
  left = 0
  width = 320
  height = 240
  private attrs = new Map<string, string>()

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  getBoundingClientRect() {
    if (this.throwOnMeasure) {
      throw new Error('ready stagger should not synchronously measure when IntersectionObserver exists')
    }
    const right = this.left + this.width
    const bottom = this.top + this.height
    return this.visible
      ? { top: this.top, left: this.left, right, bottom }
      : { top: 2000, left: this.left, right, bottom: 2000 + this.height }
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

  unobserve(target: object) {
    this.observed.delete(target)
  }

  disconnect() {
    this.observed.clear()
  }

  emit(
    entries:
      | object
      | Array<{
          target: object
          isIntersecting?: boolean
          intersectionRatio?: number
          boundingClientRect?: { top: number; left: number }
        }>,
    isIntersecting = true
  ) {
    const normalizedEntries = Array.isArray(entries)
      ? entries
      : [
          {
            target: entries,
            isIntersecting
          }
        ]
    this.callback(
      normalizedEntries.map(
        ({ target, isIntersecting: nextIntersecting = true, intersectionRatio, boundingClientRect }) =>
          ({
            target,
            isIntersecting: nextIntersecting,
            intersectionRatio:
              typeof intersectionRatio === 'number' ? intersectionRatio : nextIntersecting ? 1 : 0,
            boundingClientRect
          }) as IntersectionObserverEntry
      ),
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
  it('caps stagger delays at 72ms', () => {
    expect(resolveReadyStaggerDelay(0)).toBe(0)
    expect(resolveReadyStaggerDelay(1)).toBe(24)
    expect(resolveReadyStaggerDelay(2)).toBe(48)
    expect(resolveReadyStaggerDelay(3)).toBe(72)
    expect(resolveReadyStaggerDelay(8)).toBe(72)
  })

  it('claims sequential delays per batch', () => {
    expect(claimReadyStaggerDelay({ group: 'cards' })).toBe(0)
    expect(claimReadyStaggerDelay({ group: 'cards' })).toBe(24)
    expect(claimReadyStaggerDelay({ group: 'cards' })).toBe(48)
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

  it('defers visible cards to IntersectionObserver instead of synchronously measuring them', () => {
    const card = new MockElement()
    card.throwOnMeasure = true

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

    MockIntersectionObserver.instances[0]?.emit(card as unknown as object)

    expect(card.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
  })

  it('releases queued cards within a root in top-first viewport order and defers offscreen cards', () => {
    const lowerLeft = new MockElement()
    lowerLeft.top = 520
    lowerLeft.left = 0
    const topLeft = new MockElement()
    topLeft.top = 80
    topLeft.left = 0
    const topRight = new MockElement()
    topRight.top = 80
    topRight.left = 680
    const offscreen = new MockElement()
    offscreen.top = 1400
    offscreen.left = 0
    offscreen.visible = false

    lowerLeft.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    topLeft.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    topRight.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    offscreen.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    const root = new MockRoot([lowerLeft, topLeft, topRight, offscreen])

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

    expect(lowerLeft.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('queued')
    expect(topLeft.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('queued')
    expect(topRight.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('queued')
    expect(offscreen.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('queued')
    expect(MockIntersectionObserver.instances).toHaveLength(1)

    MockIntersectionObserver.instances[0]?.emit([
      {
        target: lowerLeft as unknown as object,
        boundingClientRect: { top: 520, left: 0 }
      },
      {
        target: topRight as unknown as object,
        boundingClientRect: { top: 80, left: 680 }
      },
      {
        target: topLeft as unknown as object,
        boundingClientRect: { top: 80, left: 0 }
      }
    ])

    expect(topLeft.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(topRight.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(lowerLeft.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(topLeft.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('0ms')
    expect(topRight.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('24ms')
    expect(lowerLeft.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('48ms')

    offscreen.visible = true
    MockIntersectionObserver.instances[0]?.emit([
      {
        target: offscreen as unknown as object,
        boundingClientRect: { top: 1400, left: 0 }
      }
    ])

    expect(offscreen.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(offscreen.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('72ms')
  })

  it('coalesces scheduled root releases into one top-first flush on the next frame', () => {
    const lowerLeft = new MockElement()
    lowerLeft.top = 520
    lowerLeft.left = 0
    const topLeft = new MockElement()
    topLeft.top = 80
    topLeft.left = 0
    lowerLeft.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    topLeft.setAttribute(READY_STAGGER_STATE_ATTR, 'queued')
    const root = new MockRoot([lowerLeft, topLeft])

    const frameCallbacks: FrameRequestCallback[] = []
    const scheduleFrame = ((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    }) as typeof requestAnimationFrame

    scheduleReleaseQueuedReadyStaggerWithin({
      root: root as unknown as ParentNode,
      queuedSelector: '.fragment-card[data-ready-stagger-state="queued"]',
      group: 'cards',
      ObserverImpl: MockIntersectionObserver as never,
      requestFrame: scheduleFrame,
      cancelFrame: (() => undefined) as typeof cancelAnimationFrame,
      win: null
    })
    scheduleReleaseQueuedReadyStaggerWithin({
      root: root as unknown as ParentNode,
      queuedSelector: '.fragment-card[data-ready-stagger-state="queued"]',
      group: 'cards',
      ObserverImpl: MockIntersectionObserver as never,
      requestFrame: scheduleFrame,
      cancelFrame: (() => undefined) as typeof cancelAnimationFrame,
      win: null
    })

    expect(frameCallbacks).toHaveLength(1)
    expect(MockIntersectionObserver.instances).toHaveLength(0)

    frameCallbacks[0]?.(0)

    expect(MockIntersectionObserver.instances).toHaveLength(1)

    MockIntersectionObserver.instances[0]?.emit([
      {
        target: lowerLeft as unknown as object,
        boundingClientRect: { top: 520, left: 0 }
      },
      {
        target: topLeft as unknown as object,
        boundingClientRect: { top: 80, left: 0 }
      }
    ])
    let frameIndex = 1
    while (frameCallbacks[frameIndex]) {
      frameCallbacks[frameIndex]?.(frameIndex * 16)
      frameIndex += 1
    }

    expect(topLeft.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(lowerLeft.getAttribute(READY_STAGGER_STATE_ATTR)).toBe('done')
    expect(topLeft.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('0ms')
    expect(lowerLeft.style.getPropertyValue(READY_STAGGER_DELAY_VAR)).toBe('24ms')
  })
})

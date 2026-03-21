import { describe, expect, it } from 'bun:test'

import { READY_STAGGER_STATE_ATTR } from '@prometheus/ui/ready-stagger'
import { STATIC_HOME_PAINT_ATTR, STATIC_HOME_STAGE_ATTR } from '../core/constants'
import { bindStaticHomeReadyStagger, scheduleStaticHomePaintReady } from './home-bootstrap'

class MockCard {
  dataset: Record<string, string> = {}
  private attrs = new Map<string, string>()

  constructor(
    fragmentId: string,
    stage: 'anchor' | 'deferred',
    private readonly rect: { top: number; bottom: number; left: number; right: number }
  ) {
    this.dataset.fragmentId = fragmentId
    this.attrs.set('data-static-fragment-card', 'true')
    this.attrs.set(STATIC_HOME_STAGE_ATTR, stage)
    this.attrs.set(READY_STAGGER_STATE_ATTR, 'queued')
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getBoundingClientRect() {
    return {
      ...this.rect,
      width: this.rect.right - this.rect.left,
      height: this.rect.bottom - this.rect.top
    }
  }
}

class MockRoot {
  private attrs = new Map<string, string>([
    ['data-static-home-root', 'true'],
    [STATIC_HOME_PAINT_ATTR, 'initial']
  ])

  constructor(private readonly cards: MockCard[]) {}

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  querySelector<T>(selector: string) {
    if (selector === '[data-static-home-root]') {
      return this as T
    }
    return null
  }

  querySelectorAll<T>(selector: string) {
    if (selector.includes('[data-static-fragment-card]')) {
      return this.cards as unknown as T[]
    }
    return [] as T[]
  }
}

class MockIntersectionObserver {
  static instance: MockIntersectionObserver | null = null

  constructor(
    private readonly callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit
  ) {
    MockIntersectionObserver.instance = this
  }

  observe(_target: Element) {}

  unobserve(_target: Element) {}

  disconnect() {}

  notify(target: Element, isIntersecting: boolean) {
    this.callback(
      [
        {
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0
        } as IntersectionObserverEntry
      ],
      this as unknown as IntersectionObserver
    )
  }
}

const createAnimationFrameQueue = () => {
  const queue: FrameRequestCallback[] = []

  return {
    requestFrame: ((callback: FrameRequestCallback) => {
      queue.push(callback)
      return queue.length
    }) as typeof requestAnimationFrame,
    cancelFrame: ((_id: number) => undefined) as typeof cancelAnimationFrame,
    flushNext: () => {
      const callback = queue.shift()
      callback?.(0)
    }
  }
}

describe('bindStaticHomeReadyStagger', () => {
  it('releases visible anchor cards only after home paint becomes ready and defers offscreen cards until visible', () => {
    const originalWindow = globalThis.window
    globalThis.window = {
      innerWidth: 1280,
      innerHeight: 800
    } as unknown as Window & typeof globalThis

    try {
      const frames = createAnimationFrameQueue()
      const queueCalls: string[] = []
      const anchor = new MockCard('fragment://page/home/planner@v1', 'anchor', {
        top: 120,
        bottom: 640,
        left: 0,
        right: 640
      })
      const deferred = new MockCard('fragment://page/home/react@v1', 'deferred', {
        top: 1600,
        bottom: 2200,
        left: 0,
        right: 640
      })
      const root = new MockRoot([anchor, deferred])
      const stagger = bindStaticHomeReadyStagger({
        root: root as unknown as ParentNode,
        ObserverImpl: MockIntersectionObserver as unknown as typeof IntersectionObserver,
        queueReady: ((card: HTMLElement) => {
          queueCalls.push(card.dataset.fragmentId ?? '')
          card.setAttribute(READY_STAGGER_STATE_ATTR, 'done')
          return 0
        }) as typeof import('@prometheus/ui/ready-stagger').queueReadyStagger
      })

      stagger.observeWithin(root as unknown as ParentNode)
      expect(queueCalls).toEqual([])

      const cleanup = scheduleStaticHomePaintReady({
        root: root as unknown as Element,
        requestFrame: frames.requestFrame,
        cancelFrame: frames.cancelFrame,
        onReady: () => {
          stagger.releaseVisible()
        }
      })

      frames.flushNext()
      expect(root.getAttribute(STATIC_HOME_PAINT_ATTR)).toBe('ready')
      MockIntersectionObserver.instance?.notify(anchor as unknown as Element, true)
      expect(queueCalls).toEqual(['fragment://page/home/planner@v1'])

      MockIntersectionObserver.instance?.notify(deferred as unknown as Element, true)
      expect(queueCalls).toEqual([
        'fragment://page/home/planner@v1',
        'fragment://page/home/react@v1'
      ])

      cleanup()
      stagger.destroy()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

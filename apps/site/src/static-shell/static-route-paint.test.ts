import { describe, expect, it } from 'bun:test'
import { scheduleStaticRoutePaintReady } from './static-route-paint'

class MockRoot {
  private attrs = new Map<string, string>([['data-home-paint', 'initial']])

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }
}

describe('scheduleStaticRoutePaintReady', () => {
  it('flips the ready attribute after two animation frames', () => {
    const root = new MockRoot()
    const frames: FrameRequestCallback[] = []
    let readyCount = 0

    const cleanup = scheduleStaticRoutePaintReady({
      root: root as unknown as Element,
      readyAttr: 'data-home-paint',
      requestFrame: ((callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      }) as typeof requestAnimationFrame,
      cancelFrame: (() => undefined) as typeof cancelAnimationFrame,
      setTimer: (() => 0) as typeof setTimeout,
      clearTimer: (() => undefined) as typeof clearTimeout,
      onReady: () => {
        readyCount += 1
      }
    })

    expect(root.getAttribute('data-home-paint')).toBe('initial')

    frames.shift()?.(0)
    expect(root.getAttribute('data-home-paint')).toBe('initial')

    frames.shift()?.(0)
    expect(root.getAttribute('data-home-paint')).toBe('ready')
    expect(readyCount).toBe(1)

    cleanup()
  })
})

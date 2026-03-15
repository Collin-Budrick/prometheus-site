import { afterEach, describe, expect, it } from 'bun:test'
import {
  replayStaticSnapshotReadyStagger,
  resetSnapshotReadyStaggerForTests
} from './snapshot-ready-stagger'

class MockRoot {
  private attrs = new Map<string, string>()

  constructor(initialAttr: string) {
    this.attrs.set(initialAttr, 'initial')
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }
}

class MockDocument {
  constructor(
    readonly homeRoot: MockRoot | null = null,
    readonly fragmentRoot: MockRoot | null = null
  ) {}

  querySelector(selector: string) {
    if (selector === '[data-static-home-root]') {
      return this.homeRoot
    }
    if (selector === '[data-static-fragment-root]') {
      return this.fragmentRoot
    }
    return null
  }
}

class MockWindow {
  setTimeout(callback: () => void) {
    callback()
    return 1 as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeout() {}
}

afterEach(() => {
  resetSnapshotReadyStaggerForTests()
})

describe('replayStaticSnapshotReadyStagger', () => {
  it('releases queued home cards after replaying the home paint gate', () => {
    const doc = new MockDocument(new MockRoot('data-home-paint'))
    const win = new MockWindow()
    const releases: Array<{ queuedSelector: string; group?: string }> = []

    replayStaticSnapshotReadyStagger({
      doc: doc as never,
      win: win as never,
      schedulePaintReady: (({ root, readyAttr, onReady }) => {
        ;(root as MockRoot).setAttribute(readyAttr, 'ready')
        onReady?.()
        return () => undefined
      }) as typeof import('./static-route-paint').scheduleStaticRoutePaintReady,
      releaseReadyStagger: ((options) => {
        releases.push({
          queuedSelector: options.queuedSelector,
          group: options.group
        })
      }) as typeof import('@prometheus/ui/ready-stagger').releaseQueuedReadyStaggerWithin
    })

    expect(doc.homeRoot?.getAttribute('data-home-paint')).toBe('ready')
    expect(releases).toEqual([
      {
        queuedSelector: '[data-static-home-root] .fragment-card[data-ready-stagger-state="queued"]',
        group: 'static-home-ready'
      }
    ])
  })

  it('releases queued static fragment cards after replaying the fragment paint gate', () => {
    const doc = new MockDocument(null, new MockRoot('data-static-fragment-paint'))
    const win = new MockWindow()
    const releases: Array<{ queuedSelector: string; group?: string }> = []

    replayStaticSnapshotReadyStagger({
      doc: doc as never,
      win: win as never,
      schedulePaintReady: (({ root, readyAttr, onReady }) => {
        ;(root as MockRoot).setAttribute(readyAttr, 'ready')
        onReady?.()
        return () => undefined
      }) as typeof import('./static-route-paint').scheduleStaticRoutePaintReady,
      releaseReadyStagger: ((options) => {
        releases.push({
          queuedSelector: options.queuedSelector,
          group: options.group
        })
      }) as typeof import('@prometheus/ui/ready-stagger').releaseQueuedReadyStaggerWithin
    })

    expect(doc.fragmentRoot?.getAttribute('data-static-fragment-paint')).toBe('ready')
    expect(releases).toEqual([
      {
        queuedSelector: '[data-static-fragment-root] .fragment-card[data-ready-stagger-state="queued"]',
        group: 'static-fragment-ready'
      }
    ])
  })
})

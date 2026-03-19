import { describe, expect, it } from 'bun:test'
import {
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_PREVIEW_VISIBLE_ATTR,
  STATIC_HOME_STAGE_ATTR
} from './constants'
import { HOME_FIRST_ANCHOR_PATCH_EVENT } from './home-anchor-patch-event'
import { promoteSatisfiedStaticHomeAnchorBatch } from './home-anchor-patch'

class MockElement {
  dataset: Record<string, string> = {}
  private attrs = new Map<string, string>()

  constructor(fragmentId: string) {
    this.dataset.fragmentId = fragmentId
    this.attrs.set('data-fragment-id', fragmentId)
    this.attrs.set('data-static-fragment-card', 'true')
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }
}

class MockRoot {
  constructor(private readonly cards: MockElement[]) {}

  querySelector<T>(selector: string) {
    const match = /data-fragment-id="([^"]+)"/.exec(selector)
    if (!match) {
      return null
    }
    return (this.cards.find((card) => card.dataset.fragmentId === match[1]) ?? null) as T | null
  }
}

class MockDocument {
  __PROM_STATIC_HOME_FIRST_ANCHOR_PATCH__?: boolean
  readonly dispatchedEvents: string[] = []

  dispatchEvent(event: Event) {
    this.dispatchedEvents.push(event.type)
    return true
  }
}

const createCard = (
  fragmentId: string,
  options: {
    stage: 'critical' | 'anchor' | 'deferred'
    version: number
    patchState: 'pending' | 'ready'
    previewVisible?: boolean
  }
) => {
  const card = new MockElement(fragmentId)
  card.setAttribute(STATIC_HOME_STAGE_ATTR, options.stage)
  card.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${options.version}`)
  card.setAttribute(STATIC_HOME_PATCH_STATE_ATTR, options.patchState)
  if (options.previewVisible) {
    card.setAttribute(STATIC_HOME_PREVIEW_VISIBLE_ATTR, 'true')
  }
  return card
}

describe('promoteSatisfiedStaticHomeAnchorBatch', () => {
  it('promotes satisfied SSR anchor cards to ready and dispatches the first-anchor event', () => {
    const manifestCard = createCard('fragment://page/home/manifest@v1', {
      stage: 'critical',
      version: 5,
      patchState: 'ready'
    })
    const dockCard = createCard('fragment://page/home/dock@v2', {
      stage: 'anchor',
      version: 7,
      patchState: 'pending',
      previewVisible: true
    })
    const root = new MockRoot([manifestCard, dockCard])
    const doc = new MockDocument()

    const didPromote = promoteSatisfiedStaticHomeAnchorBatch({
      ids: ['fragment://page/home/manifest@v1', 'fragment://page/home/dock@v2'],
      knownVersions: {
        'fragment://page/home/manifest@v1': 5,
        'fragment://page/home/dock@v2': 7
      },
      root: root as never,
      doc: doc as never
    })

    expect(didPromote).toBe(true)
    expect(dockCard.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('ready')
    expect(dockCard.dataset.fragmentStage).toBe('ready')
    expect(dockCard.dataset.fragmentReady).toBe('true')
    expect(dockCard.dataset.fragmentLoaded).toBe('true')
    expect(dockCard.dataset.revealPhase).toBe('visible')
    expect(doc.__PROM_STATIC_HOME_FIRST_ANCHOR_PATCH__).toBe(true)
    expect(doc.dispatchedEvents).toEqual([HOME_FIRST_ANCHOR_PATCH_EVENT])
  })

  it('does not redispatch once the document has already recorded the first anchor patch', () => {
    const dockCard = createCard('fragment://page/home/dock@v2', {
      stage: 'anchor',
      version: 7,
      patchState: 'ready',
      previewVisible: true
    })
    const root = new MockRoot([dockCard])
    const doc = new MockDocument()

    const firstPromotion = promoteSatisfiedStaticHomeAnchorBatch({
      ids: ['fragment://page/home/dock@v2'],
      knownVersions: {
        'fragment://page/home/dock@v2': 7
      },
      root: root as never,
      doc: doc as never
    })
    const secondPromotion = promoteSatisfiedStaticHomeAnchorBatch({
      ids: ['fragment://page/home/dock@v2'],
      knownVersions: {
        'fragment://page/home/dock@v2': 7
      },
      root: root as never,
      doc: doc as never
    })

    expect(firstPromotion).toBe(true)
    expect(secondPromotion).toBe(true)
    expect(doc.dispatchedEvents).toEqual([HOME_FIRST_ANCHOR_PATCH_EVENT])
  })
})

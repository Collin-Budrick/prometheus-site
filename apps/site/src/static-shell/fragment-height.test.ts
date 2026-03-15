import { describe, expect, it } from 'bun:test'
import {
  lockFragmentCardHeight,
  persistInitialFragmentCardHeights,
  settlePatchedFragmentCardHeight
} from './fragment-height'

class MockCard {
  dataset: Record<string, string> = {}
  style: {
    height: string
    setProperty: (name: string, value: string) => void
    getPropertyValue: (name: string) => string
  }
  private styleHeight = ''

  private readonly attrs = new Map<string, string>()
  private readonly styles = new Map<string, string>()
  private listeners = new Map<string, Array<(event: Event) => void>>()
  private wroteDuringMeasurement = false
  failOnPostWriteMeasure = false

  constructor(
    private scrollValue: number,
    private rectValue: number
  ) {
    const self = this
    this.style = {
      get height() {
        return self.styleHeight
      },
      set height(value: string) {
        self.wroteDuringMeasurement = true
        self.styleHeight = value
      },
      setProperty: (name: string, value: string) => {
        self.wroteDuringMeasurement = true
        self.styles.set(name, value)
      },
      getPropertyValue: (name: string) => self.styles.get(name) ?? ''
    }
  }

  setMeasuredHeight(nextHeight: number) {
    this.scrollValue = nextHeight
    this.rectValue = nextHeight
  }

  setAttribute(name: string, value: string) {
    this.wroteDuringMeasurement = true
    this.attrs.set(name, value)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }

  querySelectorAll() {
    return []
  }

  get scrollHeight() {
    if (this.failOnPostWriteMeasure && this.wroteDuringMeasurement) {
      throw new Error('measured scrollHeight after mutating the card')
    }
    return this.scrollValue
  }

  getBoundingClientRect() {
    if (this.failOnPostWriteMeasure && this.wroteDuringMeasurement) {
      throw new Error('measured bounding rect after mutating the card')
    }
    return { height: this.rectValue }
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatchEvent(event: Event) {
    const listeners = this.listeners.get(event.type) ?? []
    listeners.forEach((listener) => {
      listener(event)
    })
    return true
  }
}

describe('fragment height patch helpers', () => {
  it('locks a fragment card without reading geometry after mutating it', () => {
    const card = new MockCard(260, 240)
    card.failOnPostWriteMeasure = true

    const { lockHeight } = lockFragmentCardHeight(card as unknown as HTMLElement, 220)

    expect(lockHeight).toBe(260)
    expect(card.style.height).toBe('260px')
  })

  it('locks to the current rendered height and releases after the patched content settles', async () => {
    const card = new MockCard(260, 240) as unknown as HTMLElement
    card.setAttribute('data-fragment-height-hint', '200')

    const { lockHeight, lockToken } = lockFragmentCardHeight(card, 220)

    expect(lockHeight).toBe(260)
    expect(card.style.height).toBe('260px')
    expect(card.getAttribute('data-fragment-height-locked')).toBe('true')
    expect(card.getAttribute('data-fragment-height-hint')).toBe('260')

    ;(card as unknown as MockCard).setMeasuredHeight(320)
    const settledHeight = await settlePatchedFragmentCardHeight({
      card,
      fragmentId: 'fragment://page/store/cart@v1',
      lockToken,
      reservedHeight: 260
    })

    expect(settledHeight).toBe(320)
    expect(card.style.height).toBe('')
    expect(card.getAttribute('data-fragment-height-locked')).toBeNull()
    expect(card.getAttribute('data-fragment-height-hint')).toBe('320')
    expect(card.style.getPropertyValue('--fragment-min-height')).toBe('320px')
  })

  it('measures static cards after paint and persists the settled height without a patch lock', async () => {
    const card = new MockCard(330, 330) as unknown as HTMLElement
    card.dataset.fragmentId = 'fragment://page/store/stream@v5'
    card.setAttribute('data-fragment-height-hint', '300')
    const root = {
      querySelectorAll: () => [card]
    } as unknown as ParentNode

    const heights = await persistInitialFragmentCardHeights({
      root,
      routeContext: {
        path: '/store',
        lang: 'en',
        fragmentOrder: ['fragment://page/store/stream@v5'],
        planSignature: 'plan:1'
      }
    })

    expect(heights).toEqual([330])
    expect(card.getAttribute('data-fragment-height-hint')).toBe('330')
    expect(card.style.getPropertyValue('--fragment-min-height')).toBe('330px')
  })
})

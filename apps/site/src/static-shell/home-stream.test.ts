import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { h, t } from '@core/fragment/tree'
import type { FragmentPayload } from '@core/fragment/types'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR
} from './constants'
import { createStaticHomePatchQueue, patchStaticHomeFragmentCard } from './home-stream'

class MockElement {
  dataset: Record<string, string> = {}
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

  set innerHTML(value: string) {
    this.html = value
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

  querySelector<T>(selector: string) {
    if (selector.includes(STATIC_FRAGMENT_BODY_ATTR)) {
      return this.body as T | null
    }
    return null
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
  options: { critical?: boolean; version?: number; patchState?: 'pending' | 'ready' } = {}
) => {
  const body = new MockBodyElement(fragmentId, log)
  const card = new MockElement(fragmentId)
  card.dataset.fragmentId = fragmentId
  card.dataset.critical = options.critical ? 'true' : 'false'
  card.setAttribute(STATIC_FRAGMENT_VERSION_ATTR, `${options.version ?? 1}`)
  card.setAttribute(STATIC_HOME_PATCH_STATE_ATTR, options.patchState ?? 'pending')
  card.attachBody(body)
  return { card, body }
}

describe('home-stream patching', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { HTMLElement?: unknown }).HTMLElement =
      MockElement as unknown as typeof HTMLElement
  })

  afterEach(() => {
    ;(globalThis as typeof globalThis & { HTMLElement?: unknown }).HTMLElement = originalHTMLElement
  })

  it('patches pending shells even when the payload version matches SSR', () => {
    const log: string[] = []
    const { card, body } = createCard('fragment://page/home/planner@v1', log, {
      version: 5,
      patchState: 'pending'
    })

    const result = patchStaticHomeFragmentCard({
      lang: 'en',
      payload: createPayload('fragment://page/home/planner@v1', 'Patched planner', 5),
      applyEffects: false,
      card: card as unknown as HTMLElement
    })

    expect(result).toBe('patched')
    expect(body.innerHTML).toContain('Patched planner')
    expect(card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('ready')
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

  it('coalesces payloads and flushes in DOM order', () => {
    const log: string[] = []
    const planner = createCard('fragment://page/home/planner@v1', log)
    const react = createCard('fragment://page/home/react@v1', log)
    const root = new MockRoot([planner.card, react.card])
    const frames: FrameRequestCallback[] = []
    const queue = createStaticHomePatchQueue({
      lang: 'en',
      applyEffects: false,
      root: root as unknown as ParentNode,
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => undefined
    })

    queue.setVisible('fragment://page/home/planner@v1', true)
    queue.setVisible('fragment://page/home/react@v1', true)
    queue.enqueue(createPayload('fragment://page/home/react@v1', 'React first', 2))
    queue.enqueue(createPayload('fragment://page/home/planner@v1', 'Planner first', 2))
    queue.enqueue(createPayload('fragment://page/home/planner@v1', 'Planner latest', 3))

    expect(frames).toHaveLength(1)
    frames[0]?.(0)

    expect(log).toEqual(['fragment://page/home/planner@v1', 'fragment://page/home/react@v1'])
    expect(planner.body.innerHTML).toContain('Planner latest')
    expect(react.body.innerHTML).toContain('React first')
  })

  it('waits to patch demo cards until they become visible', () => {
    const log: string[] = []
    const ledger = createCard('fragment://page/home/ledger@v1', log)
    const root = new MockRoot([ledger.card])
    const queue = createStaticHomePatchQueue({
      lang: 'en',
      applyEffects: false,
      root: root as unknown as ParentNode,
      requestFrame: () => 1,
      cancelFrame: () => undefined
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
    const dock = createCard('fragment://page/home/dock@v1', log)
    const root = new MockRoot([dock.card])
    const queue = createStaticHomePatchQueue({
      lang: 'en',
      applyEffects: false,
      root: root as unknown as ParentNode,
      requestFrame: () => 1,
      cancelFrame: () => undefined
    })

    queue.enqueue(createPayload('fragment://page/home/dock@v1', 'Dock payload', 2))
    queue.flushNow()

    expect(dock.body.innerHTML).toBe('')
    expect(dock.card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('pending')

    queue.setVisible('fragment://page/home/dock@v1', true)
    queue.flushNow()

    expect(dock.body.innerHTML).toContain('Dock payload')
    expect(dock.card.getAttribute(STATIC_HOME_PATCH_STATE_ATTR)).toBe('ready')
  })
})

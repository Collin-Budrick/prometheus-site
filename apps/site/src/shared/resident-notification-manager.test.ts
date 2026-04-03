import { afterEach, describe, expect, it } from 'bun:test'
import { createResidentNotificationManager, resetResidentNotificationManagerForTests } from './resident-notification-manager'
import { createResidentNotificationStore } from './resident-notification-store'
import { buildResidentFragmentAttrs } from './resident-fragment-manager'

const toDatasetKey = (name: string) =>
  name
    .replace(/^data-/, '')
    .split('-')
    .map((part, index) => (index === 0 ? part : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`))
    .join('')

class MockElement {
  readonly nodeType = 1
  readonly dataset: Record<string, string> = {}
  parentElement: MockElement | null = null
  private readonly attributes = new Map<string, string>()

  constructor(
    readonly ownerDocument: MockDocument,
    readonly tagName = 'div'
  ) {}

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
    if (name.startsWith('data-')) {
      this.dataset[toDatasetKey(name)] = value
    }
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string) {
    return this.attributes.has(name)
  }

  appendChild(child: MockElement) {
    child.parentElement = this
    return child
  }

  closest<T extends MockElement = MockElement>(selector: string) {
    let current: MockElement | null = this
    while (current) {
      if (current.matches(selector)) {
        return current as T
      }
      current = current.parentElement
    }
    return null
  }

  matches(selector: string) {
    return selector
      .split(',')
      .map((value) => value.trim())
      .some((candidate) => {
        const attributeMatch = candidate.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
        if (!attributeMatch) {
          return false
        }
        const [, name, value] = attributeMatch
        if (!this.hasAttribute(name)) {
          return false
        }
        if (typeof value === 'string') {
          return this.getAttribute(name) === value
        }
        return true
      })
  }
}

class MockDocument {
  readonly documentElement = { lang: 'en' }
  readonly location = { pathname: '/' }

  querySelector<T extends MockElement = MockElement>(_selector: string) {
    return null as T | null
  }
}

const createResidentRoot = (mode: 'park' | 'live') => {
  const doc = new MockDocument()
  const routeRoot = new MockElement(doc, 'section')
  routeRoot.setAttribute('data-static-home-root', 'true')
  routeRoot.setAttribute('data-static-path', '/')
  const widget = new MockElement(doc, 'div')
  Object.entries(
    buildResidentFragmentAttrs('fragment://page/home/island@v1::preact-island::resident', mode)
  ).forEach(([name, value]) => {
    widget.setAttribute(name, value)
  })
  const card = new MockElement(doc, 'article')
  card.setAttribute('data-fragment-id', 'fragment://page/home/island@v1')
  routeRoot.appendChild(card)
  card.appendChild(widget)
  return widget
}

afterEach(() => {
  resetResidentNotificationManagerForTests()
})

describe('resident notification manager', () => {
  it('allows scheduled notifications only for live resident fragments', async () => {
    const messages: unknown[] = []
    const store = createResidentNotificationStore({
      now: () => 100
    })
    const manager = createResidentNotificationManager({
      now: () => 100,
      store,
      windowObject: null,
      postToServiceWorker: async (message) => {
        messages.push(message)
        return true
      }
    })

    const liveResult = await manager.emitFromRoot(createResidentRoot('live') as unknown as Element, {
      notificationKey: 'countdown-complete',
      kind: 'scheduled',
      title: 'Mission clock',
      body: 'Countdown - 0:00 - Ready',
      deliverAtMs: 1000
    })
    const parkResult = await manager.emitFromRoot(createResidentRoot('park') as unknown as Element, {
      notificationKey: 'countdown-complete',
      kind: 'scheduled',
      title: 'Mission clock',
      body: 'Countdown - 0:00 - Ready',
      deliverAtMs: 1000
    })

    expect(liveResult).toBe(true)
    expect(parkResult).toBe(false)
    expect(messages).toHaveLength(1)

    manager.destroy()
  })

  it('replays overdue notifications once and does not replay after delivery is recorded', async () => {
    const messages: Array<{ deliverNow?: boolean }> = []
    const store = createResidentNotificationStore({
      now: () => 200
    })
    await store.hydrate()
    const seeded = await store.upsertIntent(
      {
        fragmentId: 'fragment://page/home/island@v1',
        lang: 'en',
        path: '/',
        residentKey: 'fragment://page/home/island@v1::preact-island::resident',
        scopeKey: 'public'
      },
      {
        notificationKey: 'countdown-complete',
        kind: 'scheduled',
        title: 'Mission clock',
        body: 'Countdown - 0:00 - Ready',
        deliverAtMs: 100
      }
    )

    const manager = createResidentNotificationManager({
      now: () => 200,
      store,
      windowObject: null,
      postToServiceWorker: async (message) => {
        if (message.type === 'sw:resident-notification-upsert') {
          messages.push({ deliverNow: message.deliverNow })
        }
        return true
      }
    })

    await manager.init()
    expect(messages).toEqual([{ deliverNow: true }])

    await manager.handleDeliveredPayload({
      notificationId: seeded.id,
      updatedAt: seeded.updatedAt,
      deliveredAt: 250
    })

    const secondManager = createResidentNotificationManager({
      now: () => 300,
      store,
      windowObject: null,
      postToServiceWorker: async (message) => {
        if (message.type === 'sw:resident-notification-upsert') {
          messages.push({ deliverNow: message.deliverNow })
        }
        return true
      }
    })

    await secondManager.init()

    expect(messages).toEqual([{ deliverNow: true }])

    manager.destroy()
    secondManager.destroy()
  })
})


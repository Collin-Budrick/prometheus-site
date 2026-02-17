import { afterEach, describe, expect, it } from 'bun:test'

type MemoryStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

type WindowStub = EventTarget & {
  localStorage: MemoryStorage
}

type NavigatorStub = {
  onLine: boolean
}

type CookieDocument = {
  cookie: string
}

const createMemoryStorage = () => {
  const map = new Map<string, string>()
  const storage: MemoryStorage = {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    }
  }
  return { map, storage }
}

const createCookieDocument = () => {
  const cookieMap = new Map<string, string>()
  const documentStub: CookieDocument = {
    get cookie() {
      return Array.from(cookieMap.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('; ')
    },
    set cookie(raw: string) {
      const parts = raw.split(';').map((part) => part.trim())
      const [pair, ...attributes] = parts
      const delimiter = pair.indexOf('=')
      if (delimiter <= 0) return
      const key = pair.slice(0, delimiter)
      const value = pair.slice(delimiter + 1)
      const maxAge = attributes.find((entry) => entry.toLowerCase().startsWith('max-age='))
      const maxAgeValue = maxAge ? Number.parseInt(maxAge.slice('max-age='.length), 10) : null
      if (Number.isFinite(maxAgeValue) && (maxAgeValue ?? 0) <= 0) {
        cookieMap.delete(key)
        return
      }
      cookieMap.set(key, value)
    }
  }
  return { cookieMap, documentStub }
}

const installRuntime = (online: boolean) => {
  const { storage } = createMemoryStorage()
  const { cookieMap, documentStub } = createCookieDocument()
  const windowTarget = new EventTarget() as WindowStub
  windowTarget.localStorage = storage

  ;(globalThis as unknown as { window?: unknown }).window = windowTarget
  ;(globalThis as unknown as { document?: unknown }).document = documentStub
  ;(globalThis as unknown as { navigator?: unknown }).navigator = { onLine: online } satisfies NavigatorStub

  return { windowTarget, cookieMap }
}

let storeCartModulePromise: Promise<typeof import('./store-cart')> | null = null

const loadStoreCartModule = async () => {
  ;(globalThis as unknown as { __PUBLIC_APP_CONFIG__?: unknown }).__PUBLIC_APP_CONFIG__ = {
    apiBase: '',
    fragmentVisibilityMargin: '60% 0px',
    fragmentVisibilityThreshold: 0.4
  }
  if (!storeCartModulePromise) {
    storeCartModulePromise = import('./store-cart')
  }
  return storeCartModulePromise
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { document?: unknown }).document
  delete (globalThis as unknown as { navigator?: unknown }).navigator
  delete (globalThis as unknown as { fetch?: unknown }).fetch
})

describe('store cart queue persistence', () => {
  it('queues consume actions while offline and emits queue event size', async () => {
    const { windowTarget } = installRuntime(false)
    const mod = await loadStoreCartModule()
    const sizes: number[] = []

    windowTarget.addEventListener(mod.storeCartQueueEvent, (event) => {
      const detail = (event as CustomEvent<{ size?: number }>).detail
      if (typeof detail?.size === 'number') {
        sizes.push(detail.size)
      }
    })

    const result = await mod.consumeStoreItem(9, 'https://prometheus.dev')
    expect(result.queued).toBe(true)
    expect(await mod.getStoreCartQueueSize()).toBe(1)
    expect(sizes.at(-1)).toBe(1)
  })

  it('flushes queue in order and retries transient failures', async () => {
    installRuntime(false)
    const mod = await loadStoreCartModule()

    await mod.consumeStoreItem(12, 'https://prometheus.dev')
    expect(await mod.getStoreCartQueueSize()).toBe(1)

    ;(globalThis as unknown as { navigator: NavigatorStub }).navigator.onLine = true

    let calls = 0
    ;(globalThis as unknown as { fetch?: unknown }).fetch = (async () => {
      calls += 1
      if (calls === 1) {
        return new Response('unavailable', { status: 503 })
      }
      return new Response(JSON.stringify({ item: { id: 12, quantity: 0 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }) as unknown as typeof fetch

    const first = await mod.flushStoreCartQueue('https://prometheus.dev')
    expect(first.processed).toBe(0)
    expect(first.remaining).toBe(1)
    expect(await mod.getStoreCartQueueSize()).toBe(1)

    const second = await mod.flushStoreCartQueue('https://prometheus.dev')
    expect(second.processed).toBe(1)
    expect(second.remaining).toBe(0)
    expect(await mod.getStoreCartQueueSize()).toBe(0)
  })

  it('mirrors queue and snapshot state into cookies', async () => {
    const { cookieMap } = installRuntime(true)
    const mod = await loadStoreCartModule()

    await mod.persistStoreCartSnapshot([{ id: 3, name: 'Cached', price: 4.99, qty: 2 }])
    expect(cookieMap.has('prom-store-cart')).toBe(true)

    ;(globalThis as unknown as { navigator: NavigatorStub }).navigator.onLine = false
    await mod.consumeStoreItem(3, 'https://prometheus.dev')
    expect(cookieMap.has('prom-store-cart-queue')).toBe(true)
  })
})

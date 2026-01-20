import { appConfig } from '../app-config'

export type StoreCartItem = {
  id: number
  name: string
  price: number
}

export type StoreCartSnapshotItem = StoreCartItem & {
  qty: number
}

export type StoreConsumeItem = {
  id: number
  quantity: number
}

export type StoreConsumeResult = {
  ok: boolean
  status: number
  item?: StoreConsumeItem
  queued?: boolean
}

export const storeCartAddEvent = 'store:cart:add'
export const storeCartQueueEvent = 'store:cart:queue'

type StoreCartQueuedAction = {
  type: 'consume' | 'restore'
  id: number
  amount?: number
  queuedAt: string
}

let lastDraggedItem: StoreCartItem | null = null
const storeCartQueueKey = 'store-cart-queue'
const storeCartSnapshotKey = 'store-cart-snapshot'
const storeCartQueueCookieKey = 'prom-store-cart-queue'
const storeCartSnapshotCookieKey = 'prom-store-cart'

const readCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name === key) {
      if (!raw) return ''
      try {
        return decodeURIComponent(raw)
      } catch {
        return null
      }
    }
  }
  return null
}

export const setStoreCartDragItem = (item: StoreCartItem | null) => {
  lastDraggedItem = item
}

export const consumeStoreCartDragItem = () => {
  const item = lastDraggedItem
  lastDraggedItem = null
  return item
}

const parsePrice = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const parseQuantity = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(-1, Math.floor(value)) : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(-1, parsed) : 0
  }
  return 0
}

const normalizeStoreConsumeItem = (value: unknown): StoreConsumeItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const quantity = parseQuantity(record.quantity)
  return { id, quantity }
}

const buildApiUrl = (path: string, origin: string) => {
  const base = appConfig.apiBase
  if (!base) return `${origin}${path}`
  if (base.startsWith('/')) return `${origin}${base}${path}`
  return `${base}${path}`
}

export const normalizeStoreCartItem = (value: unknown): StoreCartItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name : `Item ${id}`
  const price = parsePrice(record.price)
  return { id, name, price }
}

export const normalizeStoreCartSnapshotItem = (value: unknown): StoreCartSnapshotItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const base = normalizeStoreCartItem(record)
  if (!base) return null
  const qty = parseQuantity(record.qty)
  if (!Number.isFinite(qty) || qty <= 0) return null
  return { ...base, qty }
}

const parseStoreCartQueue = (raw: string | null) => {
  if (!raw) return [] as StoreCartQueuedAction[]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const record = entry as Record<string, unknown>
        const type = record.type === 'restore' ? 'restore' : record.type === 'consume' ? 'consume' : null
        const id = Number(record.id)
        const queuedAt = typeof record.queuedAt === 'string' ? record.queuedAt : ''
        const amount = record.amount !== undefined ? parseQuantity(record.amount) : undefined
        if (!type || !Number.isFinite(id) || id <= 0 || !queuedAt) return null
        if (type === 'restore') {
          if (amount === undefined || !Number.isFinite(amount) || amount <= 0) return null
          return { type, id, amount, queuedAt }
        }
        return { type, id, queuedAt }
      })
      .filter((entry): entry is StoreCartQueuedAction => entry !== null)
  } catch {
    return []
  }
}

const parseStoreCartSnapshot = (raw: string | null) => {
  if (!raw) return [] as StoreCartSnapshotItem[]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => normalizeStoreCartSnapshotItem(entry))
      .filter((entry): entry is StoreCartSnapshotItem => entry !== null)
  } catch {
    return []
  }
}

const loadStoreCartQueue = () => {
  if (typeof window === 'undefined') return [] as StoreCartQueuedAction[]
  const raw = window.localStorage.getItem(storeCartQueueKey)
  const parsed = parseStoreCartQueue(raw)
  if (parsed.length) return parsed
  const cookieValue = typeof document === 'undefined' ? null : readCookieValue(document.cookie, storeCartQueueCookieKey)
  const cookieParsed = parseStoreCartQueue(cookieValue)
  if (cookieParsed.length) {
    try {
      window.localStorage.setItem(storeCartQueueKey, JSON.stringify(cookieParsed))
    } catch {
      // ignore storage failures
    }
  }
  return cookieParsed
}

const writeStoreCartQueueCookie = (queue: StoreCartQueuedAction[]) => {
  if (typeof document === 'undefined') return
  if (!queue.length) {
    document.cookie = `${storeCartQueueCookieKey}=; path=/; max-age=0; samesite=lax`
    return
  }
  try {
    const serialized = encodeURIComponent(JSON.stringify(queue.slice(0, 240)))
    document.cookie = `${storeCartQueueCookieKey}=${serialized}; path=/; max-age=2592000; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

const writeStoreCartSnapshotCookie = (items: StoreCartSnapshotItem[]) => {
  if (typeof document === 'undefined') return
  if (!items.length) {
    document.cookie = `${storeCartSnapshotCookieKey}=; path=/; max-age=0; samesite=lax`
    return
  }
  try {
    const serialized = encodeURIComponent(JSON.stringify(items.slice(0, 60)))
    document.cookie = `${storeCartSnapshotCookieKey}=${serialized}; path=/; max-age=2592000; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

const saveStoreCartQueue = (queue: StoreCartQueuedAction[]) => {
  if (typeof window === 'undefined') return
  if (queue.length) {
    window.localStorage.setItem(storeCartQueueKey, JSON.stringify(queue))
  } else {
    window.localStorage.removeItem(storeCartQueueKey)
  }
  writeStoreCartQueueCookie(queue)
  window.dispatchEvent(new CustomEvent(storeCartQueueEvent, { detail: { size: queue.length } }))
}

const requestStoreCartSync = async () => {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    if ('sync' in registration) {
      await registration.sync.register('store-cart-queue')
    }
  } catch {
    // ignore sync errors
  }
}

const enqueueStoreCartAction = (action: StoreCartQueuedAction) => {
  const queue = loadStoreCartQueue()
  queue.push(action)
  saveStoreCartQueue(queue)
  void requestStoreCartSync()
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const performConsumeStoreItem = async (
  id: number,
  origin: string,
  allowQueue = true
): Promise<StoreConsumeResult> => {
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 400 }
  }

  if (allowQueue && isOffline()) {
    enqueueStoreCartAction({ type: 'consume', id, queuedAt: new Date().toISOString() })
    return { ok: true, status: 0, queued: true }
  }

  try {
    const response = await fetch(buildApiUrl(`/store/items/${id}/consume`, origin), {
      method: 'POST',
      credentials: 'include'
    })

    if (!response.ok) {
      return { ok: false, status: response.status }
    }

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    const item = normalizeStoreConsumeItem((payload as Record<string, unknown> | null)?.item)
    return { ok: true, status: response.status, item: item ?? undefined }
  } catch (error) {
    console.warn('Failed to consume store item', error)
    if (allowQueue && isOffline()) {
      enqueueStoreCartAction({ type: 'consume', id, queuedAt: new Date().toISOString() })
      return { ok: true, status: 0, queued: true }
    }
    return { ok: false, status: 0 }
  }
}

const performRestoreStoreItem = async (
  id: number,
  amount: number,
  origin: string,
  allowQueue = true
): Promise<StoreConsumeResult> => {
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400 }
  }

  if (allowQueue && isOffline()) {
    enqueueStoreCartAction({ type: 'restore', id, amount, queuedAt: new Date().toISOString() })
    return { ok: true, status: 0, queued: true }
  }

  try {
    const response = await fetch(buildApiUrl(`/store/items/${id}/restore`, origin), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount })
    })

    if (!response.ok) {
      return { ok: false, status: response.status }
    }

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    const item = normalizeStoreConsumeItem((payload as Record<string, unknown> | null)?.item)
    return { ok: true, status: response.status, item: item ?? undefined }
  } catch (error) {
    console.warn('Failed to restore store item', error)
    if (allowQueue && isOffline()) {
      enqueueStoreCartAction({ type: 'restore', id, amount, queuedAt: new Date().toISOString() })
      return { ok: true, status: 0, queued: true }
    }
    return { ok: false, status: 0 }
  }
}

export const getStoreCartQueueSize = () => loadStoreCartQueue().length

export const readStoreCartQueueFromCookie = (cookieHeader: string | null) =>
  parseStoreCartQueue(readCookieValue(cookieHeader, storeCartQueueCookieKey))

export const readStoreCartSnapshotFromCookie = (cookieHeader: string | null) =>
  parseStoreCartSnapshot(readCookieValue(cookieHeader, storeCartSnapshotCookieKey))

export const persistStoreCartSnapshot = (items: StoreCartSnapshotItem[]) => {
  if (typeof window === 'undefined') return
  const normalized = items
    .map((item) => normalizeStoreCartSnapshotItem(item))
    .filter((entry): entry is StoreCartSnapshotItem => entry !== null)
  if (normalized.length) {
    try {
      window.localStorage.setItem(storeCartSnapshotKey, JSON.stringify(normalized))
    } catch {
      // ignore storage failures
    }
  } else {
    window.localStorage.removeItem(storeCartSnapshotKey)
  }
  writeStoreCartSnapshotCookie(normalized)
}

export const flushStoreCartQueue = async (origin: string) => {
  if (typeof window === 'undefined') return { processed: 0, remaining: 0 }
  if (isOffline()) return { processed: 0, remaining: loadStoreCartQueue().length }
  const queue = loadStoreCartQueue()
  if (!queue.length) return { processed: 0, remaining: 0 }
  const remaining: StoreCartQueuedAction[] = []
  let processed = 0

  for (const action of queue) {
    if (isOffline()) {
      remaining.push(action)
      continue
    }
    const result =
      action.type === 'consume'
        ? await performConsumeStoreItem(action.id, origin, false)
        : await performRestoreStoreItem(action.id, action.amount ?? 0, origin, false)
    const shouldRetry = !result.ok && (result.status === 0 || result.status >= 500)
    if (shouldRetry) {
      remaining.push(action)
    } else {
      processed += 1
    }
  }

  saveStoreCartQueue(remaining)
  return { processed, remaining: remaining.length }
}

export const consumeStoreItem = async (id: number, origin: string): Promise<StoreConsumeResult> =>
  performConsumeStoreItem(id, origin, true)

export const restoreStoreItem = async (
  id: number,
  amount: number,
  origin: string
): Promise<StoreConsumeResult> => performRestoreStoreItem(id, amount, origin, true)

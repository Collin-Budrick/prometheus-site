import { appConfig } from '../public-app-config'
import { getSpacetimeDbAuthToken } from './spacetime-auth'
import {
  createStoreLocalRepo,
  parseStoreCartQueue,
  parseStoreCartSnapshot,
  serializeStoreCartQueue,
  serializeStoreCartSnapshot,
  storeCartQueueStorageKey,
  storeCartSnapshotStorageKey,
  type StoreCartQueuedAction,
  type StoreCartSnapshotItem,
  type StoreLocalSeed,
  type StoreLocalRepo
} from './store-local-repo'
import {
  getBackgroundStoreQueue,
  setBackgroundStoreQueue,
  syncBackgroundStoreQueue
} from '../native/background-runner'

export type StoreCartItem = {
  id: number
  name: string
  price: number
}

export type { StoreCartSnapshotItem }

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
export const storeInventoryEvent = 'store:inventory:update'

export type StoreCommandPayload = {
  type: 'consume' | 'restore'
  id: number
  amount?: number
}

export type StoreCommandSender = (payload: StoreCommandPayload) => Promise<StoreConsumeResult | null>

const storeCartQueueCookieKey = 'prom-store-cart-queue'
const storeCartSnapshotCookieKey = 'prom-store-cart'

let lastDraggedItem: StoreCartItem | null = null
let storeCommandSender: StoreCommandSender | null = null
let storeLocalRepoPromise: Promise<StoreLocalRepo> | null = null

const readCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [name, raw] = part.trim().split('=')
    if (name !== key) continue
    if (!raw) return ''
    try {
      return decodeURIComponent(raw)
    } catch {
      return null
    }
  }
  return null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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

const readLocalStorageValue = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const normalizeQueueAction = (value: unknown): StoreCartQueuedAction | null => {
  if (!isRecord(value)) return null
  const type = value.type === 'restore' ? 'restore' : value.type === 'consume' ? 'consume' : null
  const id = Number(value.id)
  const queuedAt = typeof value.queuedAt === 'string' ? value.queuedAt : ''
  const amount = value.amount !== undefined ? parseQuantity(value.amount) : undefined
  if (!type || !Number.isFinite(id) || id <= 0 || !queuedAt) return null
  if (type === 'restore') {
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0) return null
    return { type, id, amount, queuedAt }
  }
  return { type, id, queuedAt }
}

export const setStoreCartDragItem = (item: StoreCartItem | null) => {
  lastDraggedItem = item
}

export const setStoreCommandSender = (sender: StoreCommandSender | null) => {
  storeCommandSender = sender
}

export const consumeStoreCartDragItem = () => {
  const item = lastDraggedItem
  lastDraggedItem = null
  return item
}

const normalizeStoreConsumeItem = (value: unknown): StoreConsumeItem | null => {
  if (!isRecord(value)) return null
  const id = Number(value.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const quantity = parseQuantity(value.quantity)
  return { id, quantity }
}

const buildApiCandidates = (path: string, origin: string) => {
  const base = appConfig.apiBase
  const candidates: string[] = []
  const pushCandidate = (value: string) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value)
    }
  }

  if (!base) {
    pushCandidate(`${origin}${path}`)
    return candidates
  }

  if (base.startsWith('/')) {
    pushCandidate(`${origin}${base}${path}`)
    pushCandidate(`${origin}${path}`)
    return candidates
  }

  pushCandidate(`${base}${path}`)
  if (origin) {
    pushCandidate(`${origin}${path}`)
  }
  return candidates
}

const fetchStoreApi = async (path: string, origin: string, init: RequestInit) => {
  const candidates = buildApiCandidates(path, origin)
  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, init)
      if (response.status === 404 && candidate !== candidates[candidates.length - 1]) {
        lastResponse = response
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (candidate === candidates[candidates.length - 1]) {
        throw error
      }
    }
  }

  if (lastResponse) return lastResponse
  throw lastError instanceof Error ? lastError : new Error('Store API request failed.')
}

const buildStoreMutationHeaders = async (contentType?: string) => {
  const headers = new Headers()
  if (contentType) {
    headers.set('content-type', contentType)
  }
  const token = await getSpacetimeDbAuthToken()
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }
  return headers
}

const emitInventoryUpdate = (item?: StoreConsumeItem) => {
  if (!item || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(storeInventoryEvent, { detail: item }))
}

export const normalizeStoreCartItem = (value: unknown): StoreCartItem | null => {
  if (!isRecord(value)) return null
  const id = Number(value.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const name = typeof value.name === 'string' && value.name.trim() !== '' ? value.name : `Item ${id}`
  const price = parsePrice(value.price)
  return { id, name, price }
}

export const normalizeStoreCartSnapshotItem = (value: unknown): StoreCartSnapshotItem | null => {
  if (!isRecord(value)) return null
  const base = normalizeStoreCartItem(value)
  if (!base) return null
  const qty = parseQuantity(value.qty)
  if (!Number.isFinite(qty) || qty <= 0) return null
  return { ...base, qty }
}

const writeStoreCartQueueCookie = (queue: StoreCartQueuedAction[]) => {
  if (typeof document === 'undefined') return
  if (!queue.length) {
    document.cookie = `${storeCartQueueCookieKey}=; path=/; max-age=0; samesite=lax`
    return
  }
  try {
    const serialized = encodeURIComponent(serializeStoreCartQueue(queue.slice(0, 240)))
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
    const serialized = encodeURIComponent(serializeStoreCartSnapshot(items.slice(0, 60)))
    document.cookie = `${storeCartSnapshotCookieKey}=${serialized}; path=/; max-age=2592000; samesite=lax`
  } catch {
    // ignore cookie failures
  }
}

const emitQueueSizeUpdate = (size: number) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(storeCartQueueEvent, { detail: { size } }))
}

const mirrorStoreCartQueue = (queue: StoreCartQueuedAction[]) => {
  writeStoreCartQueueCookie(queue)
  emitQueueSizeUpdate(queue.length)
}

const resolveLegacyQueueSeed = () => {
  if (typeof window === 'undefined') return [] as StoreCartQueuedAction[]
  const localParsed = parseStoreCartQueue(readLocalStorageValue(storeCartQueueStorageKey))
  if (localParsed.length) return localParsed
  const cookieValue = typeof document === 'undefined' ? null : readCookieValue(document.cookie, storeCartQueueCookieKey)
  return parseStoreCartQueue(cookieValue)
}

const resolveLegacySnapshotSeed = () => {
  if (typeof window === 'undefined') return [] as StoreCartSnapshotItem[]
  const localParsed = parseStoreCartSnapshot(readLocalStorageValue(storeCartSnapshotStorageKey))
  if (localParsed.length) return localParsed
  const cookieValue = typeof document === 'undefined' ? null : readCookieValue(document.cookie, storeCartSnapshotCookieKey)
  return parseStoreCartSnapshot(cookieValue)
}

const resolveStoreLocalSeed = (): StoreLocalSeed => ({
  queue: resolveLegacyQueueSeed(),
  snapshot: resolveLegacySnapshotSeed()
})

const getStoreLocalRepo = async () => {
  if (!storeLocalRepoPromise) {
    storeLocalRepoPromise = (async () => {
      const repo = createStoreLocalRepo()
      await repo.init(resolveStoreLocalSeed())
      return repo
    })()
  }
  try {
    return await storeLocalRepoPromise
  } catch (error) {
    storeLocalRepoPromise = null
    throw error
  }
}

const loadStoreCartQueue = async () => {
  if (typeof window === 'undefined') return [] as StoreCartQueuedAction[]
  const nativeQueue = await getBackgroundStoreQueue()
  if (nativeQueue) {
    return nativeQueue
      .map((entry) => normalizeQueueAction(entry))
      .filter((entry): entry is StoreCartQueuedAction => entry !== null)
  }
  try {
    const repo = await getStoreLocalRepo()
    const queue = await repo.readQueue()
    return queue
      .map((entry) => normalizeQueueAction(entry))
      .filter((entry): entry is StoreCartQueuedAction => entry !== null)
  } catch {
    return resolveLegacyQueueSeed()
  }
}

const saveStoreCartQueue = async (queue: StoreCartQueuedAction[]) => {
  if (typeof window === 'undefined') return
  const normalized = queue
    .map((entry) => normalizeQueueAction(entry))
    .filter((entry): entry is StoreCartQueuedAction => entry !== null)
  const nativeSaved = await setBackgroundStoreQueue(normalized)
  if (nativeSaved) {
    mirrorStoreCartQueue(normalized)
    return
  }
  try {
    const repo = await getStoreLocalRepo()
    await repo.writeQueue(normalized)
  } catch {
    // ignore repo storage failures; cookie mirror still tracks queue state for SSR fallback.
  }
  mirrorStoreCartQueue(normalized)
}

const saveStoreCartSnapshot = async (items: StoreCartSnapshotItem[]) => {
  if (typeof window === 'undefined') return
  const normalized = items
    .map((entry) => normalizeStoreCartSnapshotItem(entry))
    .filter((entry): entry is StoreCartSnapshotItem => entry !== null)
  try {
    const repo = await getStoreLocalRepo()
    await repo.writeSnapshot(normalized)
  } catch {
    // ignore repo storage failures; cookie mirror still tracks snapshot state for SSR fallback.
  }
  writeStoreCartSnapshotCookie(normalized)
}

const requestStoreCartSync = async (origin: string) => {
  if (typeof window === 'undefined') return
  if (!appConfig.template.features.pwa) return
  const nativeSync = await syncBackgroundStoreQueue({ origin, reason: 'enqueue' })
  if (nativeSync) return
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

const enqueueStoreCartAction = async (action: StoreCartQueuedAction, origin: string) => {
  const queue = await loadStoreCartQueue()
  queue.push(action)
  await saveStoreCartQueue(queue)
  void requestStoreCartSync(origin)
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
    await enqueueStoreCartAction({ type: 'consume', id, queuedAt: new Date().toISOString() }, origin)
    return { ok: true, status: 0, queued: true }
  }

  if (storeCommandSender && !isOffline()) {
    try {
      const result = await storeCommandSender({ type: 'consume', id })
      if (result) return result
    } catch (error) {
      console.warn('Store command consume failed', error)
      return { ok: false, status: 0 }
    }
  }

  try {
  const response = await fetchStoreApi(`/store/items/${id}/consume`, origin, {
    method: 'POST',
    credentials: 'include',
    headers: await buildStoreMutationHeaders()
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
      await enqueueStoreCartAction({ type: 'consume', id, queuedAt: new Date().toISOString() }, origin)
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
    await enqueueStoreCartAction({ type: 'restore', id, amount, queuedAt: new Date().toISOString() }, origin)
    return { ok: true, status: 0, queued: true }
  }

  if (storeCommandSender && !isOffline()) {
    try {
      const result = await storeCommandSender({ type: 'restore', id, amount })
      if (result) {
        emitInventoryUpdate(result.item)
        return result
      }
    } catch (error) {
      console.warn('Store command restore failed', error)
      return { ok: false, status: 0 }
    }
  }

  try {
  const response = await fetchStoreApi(`/store/items/${id}/restore`, origin, {
    method: 'POST',
    credentials: 'include',
    headers: await buildStoreMutationHeaders('application/json'),
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
    emitInventoryUpdate(item ?? undefined)
    return { ok: true, status: response.status, item: item ?? undefined }
  } catch (error) {
    console.warn('Failed to restore store item', error)
    if (allowQueue && isOffline()) {
      await enqueueStoreCartAction({ type: 'restore', id, amount, queuedAt: new Date().toISOString() }, origin)
      return { ok: true, status: 0, queued: true }
    }
    return { ok: false, status: 0 }
  }
}

export const getStoreCartQueueSize = async () => {
  if (typeof window === 'undefined') return 0
  const nativeQueue = await getBackgroundStoreQueue()
  if (nativeQueue) return nativeQueue.length
  try {
    const repo = await getStoreLocalRepo()
    return await repo.getQueueSize()
  } catch {
    return resolveLegacyQueueSeed().length
  }
}

export const readStoreCartQueueFromCookie = (cookieHeader: string | null) =>
  parseStoreCartQueue(readCookieValue(cookieHeader, storeCartQueueCookieKey))

export const readStoreCartSnapshotFromCookie = (cookieHeader: string | null) =>
  parseStoreCartSnapshot(readCookieValue(cookieHeader, storeCartSnapshotCookieKey))

export const persistStoreCartSnapshot = async (items: StoreCartSnapshotItem[]) => {
  if (typeof window === 'undefined') return
  await saveStoreCartSnapshot(items)
}

export const flushStoreCartQueue = async (origin: string) => {
  if (typeof window === 'undefined') return { processed: 0, remaining: 0 }
  if (isOffline()) return { processed: 0, remaining: await getStoreCartQueueSize() }
  const nativeSync = await syncBackgroundStoreQueue({ origin, reason: 'manual' })
  if (nativeSync) {
    const queue = await loadStoreCartQueue()
    mirrorStoreCartQueue(queue)
    return nativeSync
  }
  const queue = await loadStoreCartQueue()
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

  await saveStoreCartQueue(remaining)
  return { processed, remaining: remaining.length }
}

export const consumeStoreItem = async (id: number, origin: string): Promise<StoreConsumeResult> =>
  performConsumeStoreItem(id, origin, true)

export const restoreStoreItem = async (
  id: number,
  amount: number,
  origin: string
): Promise<StoreConsumeResult> => performRestoreStoreItem(id, amount, origin, true)

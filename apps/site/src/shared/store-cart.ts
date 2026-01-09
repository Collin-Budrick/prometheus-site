import { appConfig } from '../app-config'

export type StoreCartItem = {
  id: number
  name: string
  price: number
}

export type StoreConsumeItem = {
  id: number
  quantity: number
}

export type StoreConsumeResult = {
  ok: boolean
  status: number
  item?: StoreConsumeItem
}

export const storeCartAddEvent = 'store:cart:add'

let lastDraggedItem: StoreCartItem | null = null

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

export const consumeStoreItem = async (id: number, origin: string): Promise<StoreConsumeResult> => {
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 400 }
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
    return { ok: false, status: 0 }
  }
}

export const restoreStoreItem = async (
  id: number,
  amount: number,
  origin: string
): Promise<StoreConsumeResult> => {
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400 }
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
    return { ok: false, status: 0 }
  }
}

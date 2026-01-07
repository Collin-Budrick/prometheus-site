export type StoreCartItem = {
  id: number
  name: string
  price: number
}

export const storeCartAddEvent = 'store:cart:add'

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

export const normalizeStoreCartItem = (value: unknown): StoreCartItem | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name : `Item ${id}`
  const price = parsePrice(record.price)
  return { id, name, price }
}

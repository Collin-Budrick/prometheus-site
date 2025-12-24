import type { storeItems } from '../../../../../api/src/db/schema'

export type StoreItemRow = typeof storeItems.$inferSelect

export type StoreItem = { id: StoreItemRow['id']; name: StoreItemRow['name']; price: number }
export type StoreItemsResult = { items: StoreItem[]; cursor: number | null; source: 'db' | 'fallback' }

const centsFromDecimal = (value: string): bigint | null => {
  const normalized = value.trim()
  if (!normalized) return null

  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return null

  const [, sign, whole, fractionRaw = ''] = match
  const fraction = fractionRaw.padEnd(2, '0').slice(0, 2)
  const cents = BigInt(whole) * 100n + BigInt(fraction)

  return sign === '-' ? -cents : cents
}

export const priceToCents = (value: unknown): bigint | null => centsFromDecimal(String(value ?? ''))

export const centsToDecimalString = (cents: bigint): string => {
  const sign = cents < 0n ? '-' : ''
  const absolute = cents < 0n ? -cents : cents
  const whole = absolute / 100n
  const fraction = absolute % 100n
  return `${sign}${whole.toString()}.${fraction.toString().padStart(2, '0')}`
}

export const centsToNumber = (cents: bigint): number => Number.parseFloat(centsToDecimalString(cents))

export const normalizeItem = (item: StoreItemRow): StoreItem => {
  const priceCents = priceToCents(item.price)
  const priceNumber = priceCents === null ? 0 : centsToNumber(priceCents)

  return {
    id: item.id,
    name: item.name,
    price: priceNumber
  }
}

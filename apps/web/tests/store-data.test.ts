import { describe, expect, it } from 'bun:test'
import type { StoreItemRow } from '../src/routes/[locale]/store/store-data'
import { centsToDecimalString, centsToNumber, normalizeItem, priceToCents } from '../src/routes/[locale]/store/store-data'

const makeRow = (price: StoreItemRow['price']): StoreItemRow => ({
  id: 1,
  name: 'High precision widget',
  price,
  createdAt: new Date()
})

describe('store price decimals', () => {
  it('stores incoming prices as integer cents to avoid floating drift', () => {
    const cents = priceToCents('123456789.99')

    expect(cents?.toString()).toBe('12345678999')
    expect(centsToDecimalString(cents!)).toBe('123456789.99')
    expect(centsToNumber(cents!).toFixed(2)).toBe('123456789.99')
  })

  it('trims extra fractional precision while preserving scale', () => {
    const cents = priceToCents('19.999')

    expect(cents?.toString()).toBe('1999')
    expect(centsToNumber(cents!).toFixed(2)).toBe('19.99')
  })

  it('normalizes stored numeric strings into precise numbers', () => {
    const normalized = normalizeItem(makeRow('987654321.01'))

    expect(normalized.price.toFixed(2)).toBe('987654321.01')
  })
})

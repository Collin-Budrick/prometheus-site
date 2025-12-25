import { routeAction$, routeLoader$, server$, type RequestEventBase, type RequestHandler } from '@builder.io/qwik-city'
import { _, locales, type Locale } from 'compiled-i18n'
import { eq, gt } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod/v4'
import { db } from '../../../server/db/client'
import { storeItems } from '../../../../../api/src/db/schema'
import { resolveLocale } from '../../../i18n/locale'
import { ensureLocaleDictionary } from '../../../i18n/dictionaries'

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

const buildCreateStoreItemSchema = () =>
  createInsertSchema(storeItems, {
    name: z.string().trim().min(1),
    price: z.string().trim()
  }).pick({ name: true, price: true })

export const normalizeItem = (item: StoreItemRow): StoreItem => {
  const priceCents = priceToCents(item.price)
  const priceNumber = priceCents === null ? 0 : centsToNumber(priceCents)

  return {
    id: item.id,
    name: item.name,
    price: priceNumber
  }
}

export const onGet: RequestHandler = ({ cacheControl }) => {
  if (import.meta.env.PROD) {
    cacheControl({
      public: true,
      noCache: true,
      maxAge: 0,
      sMaxAge: 0,
      staleWhileRevalidate: 0
    })
  }
}

// The store page relies on these server-side loaders for reads; the standalone API route was removed
// to avoid duplicating query/normalization logic in multiple paths.
const loadStoreItems = async (cursor?: number): Promise<StoreItemsResult> => {
  const limit = 6
  const lastId = Number.isFinite(cursor) && (cursor ?? 0) > 0 ? Number(cursor) : 0
  const baseQuery = db.select().from(storeItems)
  const paginated = lastId > 0 ? baseQuery.where(gt(storeItems.id, lastId)) : baseQuery
  try {
    const rows = await paginated.orderBy(storeItems.id).limit(limit)
    const normalized = rows.map(normalizeItem)
    const nextCursor = normalized.length === limit ? normalized[normalized.length - 1].id : null
    return { items: normalized, cursor: nextCursor, source: 'db' }
  } catch (err) {
    console.error('Failed to load store items', err)
    const fallbackItems: StoreItem[] = [
      { id: -1, name: _`Sample adapter (offline)`, price: 24.99 },
      { id: -2, name: _`Edge cache pack (offline)`, price: 12.5 }
    ]
    return { items: fallbackItems, cursor: null, source: 'fallback' }
  }
}

const resolveRequestLocale = (event: RequestEventBase) => {
  const eventLocale = event.params?.locale
  if (eventLocale && locales.includes(eventLocale as Locale)) return eventLocale as Locale
  return resolveLocale({
    queryLocale: event.query.get('locale'),
    cookieLocale: event.cookie.get('locale')?.value ?? null,
    acceptLanguage: event.request.headers.get('accept-language')
  }) as Locale
}

export const fetchStoreItems = server$(async function (this: RequestEventBase, cursor?: number) {
  await ensureLocaleDictionary(resolveRequestLocale(this))
  return loadStoreItems(cursor)
})

export const useStoreItemsLoader = routeLoader$(async (event) => {
  await ensureLocaleDictionary(resolveRequestLocale(event))
  return loadStoreItems()
})

export const useDeleteStoreItem = routeAction$(async (data, event) => {
  await ensureLocaleDictionary(resolveRequestLocale(event))
  const id = Number.parseInt(String(data.id ?? ''), 10)
  if (!Number.isFinite(id) || id <= 0) {
    return { success: false, error: _`Invalid id.` }
  }

  try {
    const [removed] = await db.delete(storeItems).where(eq(storeItems.id, id)).returning()
    if (!removed) {
      return { success: false, error: _`Item not found.` }
    }
    return { success: true, id }
  } catch (err) {
    console.error('Failed to delete store item', err)
    return { success: false, error: _`Unable to delete item right now.` }
  }
})

export const useCreateStoreItem = routeAction$(async (data, event) => {
  await ensureLocaleDictionary(resolveRequestLocale(event))
  const parsed = buildCreateStoreItemSchema().safeParse({
    name: data.name,
    price: data.price
  })
  if (!parsed.success) {
    return { success: false, error: _`Name and positive price required.` }
  }

  const priceCents = priceToCents(parsed.data.price)

  if (priceCents === null || priceCents <= 0) {
    return { success: false, error: _`Name and positive price required.` }
  }

  try {
    const price = centsToDecimalString(priceCents)
    const [row] = await db.insert(storeItems).values({ name: parsed.data.name, price }).returning()
    return { success: true, item: normalizeItem(row) }
  } catch (err) {
    console.error('Failed to create store item', err)
    return { success: false, error: _`Unable to create item right now.` }
  }
})

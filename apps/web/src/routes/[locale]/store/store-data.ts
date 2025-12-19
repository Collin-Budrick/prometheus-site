import { routeAction$, routeLoader$, server$, type RequestHandler } from '@builder.io/qwik-city'
import { _ } from 'compiled-i18n'
import { eq, gt } from 'drizzle-orm'
import { db } from '../../../server/db/client'
import { storeItems } from '../../../server/db/schema'
import {
  centsToDecimalString,
  normalizeItem,
  priceToCents,
  type StoreItem,
  type StoreItemsResult
} from './store-decimal'

export type { StoreItem, StoreItemsResult } from './store-decimal'

export const onGet: RequestHandler = ({ cacheControl }) => {
  if (import.meta.env.PROD) {
    cacheControl({
      public: true,
      maxAge: 300,
      sMaxAge: 900,
      staleWhileRevalidate: 60
    })
  }
}

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

export const fetchStoreItems = server$(async (cursor?: number) => loadStoreItems(cursor))

export const useStoreItemsLoader = routeLoader$(async () => loadStoreItems())

export const useDeleteStoreItem = routeAction$(async (data) => {
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

export const useCreateStoreItem = routeAction$(async (data) => {
  const name = String(data.name ?? '').trim()
  const priceCents = priceToCents(data.price)

  if (!name || priceCents === null || priceCents <= 0) {
    return { success: false, error: _`Name and positive price required.` }
  }

  try {
    const price = centsToDecimalString(priceCents)
    const [row] = await db.insert(storeItems).values({ name, price }).returning()
    return { success: true, item: normalizeItem(row) }
  } catch (err) {
    console.error('Failed to create store item', err)
    return { success: false, error: _`Unable to create item right now.` }
  }
})

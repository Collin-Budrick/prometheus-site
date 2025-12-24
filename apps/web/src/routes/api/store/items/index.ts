import { gt } from 'drizzle-orm'
import type { RequestHandler } from '@builder.io/qwik-city'
import { db } from '../../../../server/db/client'
import { storeItems, type StoreItemRow } from '../../../../../../api/src/db/schema'

export const onGet: RequestHandler = async ({ cacheControl, query, json }) => {
  cacheControl({
    public: true,
    maxAge: 300,
    sMaxAge: 900,
    staleWhileRevalidate: 60
  })

  const parsedLimit = Number.parseInt(query.get('limit') ?? '', 10)
  const parsedCursor = Number.parseInt(query.get('cursor') ?? '', 10)
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 10
  const lastId = Number.isFinite(parsedCursor) && parsedCursor > 0 ? parsedCursor : 0

  try {
    const baseQuery = db.select().from(storeItems)
    const paginated = lastId > 0 ? baseQuery.where(gt(storeItems.id, lastId)) : baseQuery
    const rows = await paginated.orderBy(storeItems.id).limit(limit)

    const items = rows.map((row: StoreItemRow) => ({
      ...row,
      price: Number.parseFloat(String(row.price))
    }))
    const nextCursor = items.length === limit ? items[items.length - 1].id : null

    json(200, { items, cursor: nextCursor })
  } catch (err) {
    console.error('Failed to load store items', err)
    json(500, { error: 'Unable to load items right now.' })
  }
}

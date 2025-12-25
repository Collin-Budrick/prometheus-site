import { eq } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { db, pgClient } from '../db/client'
import { storeItems } from '../db/schema'

type StoreItemRow = typeof storeItems.$inferSelect
type StoreItemRowSnapshot = Pick<StoreItemRow, 'id' | 'name' | 'price'>

export type StoreItemPayload = {
  id: StoreItemRow['id']
  name: StoreItemRow['name']
  price: number
}

export type StoreRealtimeEvent =
  | { type: 'store:upsert'; item: StoreItemPayload }
  | { type: 'store:delete'; id: number }

const storeUpdatesChannel = 'store_items_updates'

const dbEventSchema = z.object({
  table: z.literal('store_items'),
  op: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  id: z.coerce.number().int().nonnegative()
})

const storeItemSchema = createSelectSchema(storeItems).pick({
  id: true,
  name: true,
  price: true
})

const parsePrice = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeStoreItem = (row: StoreItemRowSnapshot): StoreItemPayload => ({
  id: row.id,
  name: row.name,
  price: parsePrice(row.price)
})

let listener: Awaited<ReturnType<typeof pgClient.listen>> | null = null

export const startStoreRealtime = async (emit: (event: StoreRealtimeEvent) => void) => {
  if (listener) return listener

  listener = await pgClient.listen(
    storeUpdatesChannel,
    async (payload) => {
      let parsedPayload: unknown
      try {
        parsedPayload = JSON.parse(payload)
      } catch (error) {
        console.warn('Store realtime payload was not JSON', error)
        return
      }

      const event = dbEventSchema.safeParse(parsedPayload)
      if (!event.success) {
        console.warn('Store realtime payload failed validation', event.error.flatten())
        return
      }

      const { op, id } = event.data
      if (op === 'DELETE') {
        emit({ type: 'store:delete', id })
        return
      }

      try {
        const [row] = await db.select().from(storeItems).where(eq(storeItems.id, id)).limit(1)
        if (!row) return
        const parsedRow = storeItemSchema.safeParse(row)
        if (!parsedRow.success) {
          console.warn('Store item failed validation for realtime event', parsedRow.error.flatten())
          return
        }
        emit({ type: 'store:upsert', item: normalizeStoreItem(parsedRow.data) })
      } catch (error) {
        console.error('Failed to load store item for realtime event', error)
      }
    },
    () => {
      console.log(`Store realtime listening on ${storeUpdatesChannel}`)
    }
  )

  return listener
}

export const stopStoreRealtime = async () => {
  if (!listener) return
  await listener.unlisten()
  listener = null
}

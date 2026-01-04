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
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const normalizeStoreItem = (row: StoreItemRowSnapshot): StoreItemPayload => ({
  id: row.id,
  name: row.name,
  price: parsePrice(row.price)
})

let listener: Awaited<ReturnType<typeof pgClient.listen>> | null = null
let retryTimer: NodeJS.Timeout | null = null
let retryAttempts = 0
let stopped = false
let watchdog: NodeJS.Timeout | null = null
let emitCallback: ((event: StoreRealtimeEvent) => void) | null = null

const clearRetryTimer = () => {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

const scheduleRetry = (reason?: unknown) => {
  if (stopped) return
  if (retryTimer) return
  const delay = Math.min(30000, 1000 * 2 ** retryAttempts)
  retryAttempts += 1
  console.warn('Reconnecting store realtime listener', { attempt: retryAttempts, delay, reason })
  retryTimer = setTimeout(() => {
    retryTimer = null
    void attachListener()
  }, delay)
}

const resetListener = async () => {
  if (listener) {
    try {
      await listener.unlisten()
    } catch (error) {
      console.error('Failed to unlisten store realtime channel', error)
    }
  }
  listener = null
}

const handleDbEvent = async (payload: string, emit: (event: StoreRealtimeEvent) => void) => {
  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(payload)
  } catch (error) {
    console.warn('Store realtime payload was not JSON', error)
    return
  }

  const event = dbEventSchema.safeParse(parsedPayload)
  if (!event.success) {
    console.warn('Store realtime payload failed validation', z.treeifyError(event.error))
    return
  }

  const { op, id } = event.data
  if (op === 'DELETE') {
    emit({ type: 'store:delete', id })
    return
  }

  try {
    const [row] = await db.select().from(storeItems).where(eq(storeItems.id, id)).limit(1)
    if (row === undefined) return
    const parsedRow = storeItemSchema.safeParse(row)
    if (!parsedRow.success) {
      console.warn('Store item failed validation for realtime event', z.treeifyError(parsedRow.error))
      return
    }
    emit({ type: 'store:upsert', item: normalizeStoreItem(parsedRow.data) })
  } catch (error) {
    console.error('Failed to load store item for realtime event', error)
    throw error
  }
}

const attachListener = async () => {
  if (listener !== null || stopped || emitCallback === null) return listener

  try {
    const handlePayload = (payload: string) => {
      if (stopped) return
      const emit = (event: StoreRealtimeEvent) => {
        const currentEmit = emitCallback
        if (currentEmit === null || stopped) return
        currentEmit(event)
      }
      void (async () => {
        try {
          await handleDbEvent(payload, emit)
        } catch (error) {
          await resetListener()
          scheduleRetry(error)
        }
      })()
    }

    listener = await pgClient.listen(
      storeUpdatesChannel,
      handlePayload,
      () => {
        retryAttempts = 0
        console.log(`Store realtime listening on ${storeUpdatesChannel}`)
      }
    )
  } catch (error) {
    console.error('Failed to start store realtime listener', error)
    listener = null
    scheduleRetry(error)
  }

  return listener
}

export const startStoreRealtime = async (emit: (event: StoreRealtimeEvent) => void) => {
  if (stopped === true) stopped = false
  clearRetryTimer()
  emitCallback = emit
  if (!watchdog) {
    watchdog = setInterval(() => {
      if (stopped) return
      if (!listener && !retryTimer) {
        scheduleRetry('missing listener')
      }
    }, 30000)
  }
  if (listener) return listener
  return attachListener()
}

export const stopStoreRealtime = async () => {
  stopped = true
  clearRetryTimer()
  if (watchdog) {
    clearInterval(watchdog)
    watchdog = null
  }
  emitCallback = null
  if (!listener) return
  await resetListener()
}

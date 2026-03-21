import { afterEach, describe, expect, it } from 'bun:test'
import { createStoreLocalRepo, parseStoreCartQueue, storeCartQueueStorageKey } from './store-local-repo'

type MemoryStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

type WindowStub = {
  localStorage: MemoryStorage
}

const createMemoryStorage = () => {
  const map = new Map<string, string>()
  const storage: MemoryStorage = {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    }
  }
  return { map, storage }
}

const installWindow = () => {
  const { map, storage } = createMemoryStorage()
  ;(globalThis as unknown as { window?: unknown }).window = { localStorage: storage } satisfies WindowStub
  return { map, storage }
}

class FakeSQLiteDatabase {
  private meta = new Map<string, string>()
  private queue: Array<{ seq: number; action_type: 'consume' | 'restore'; item_id: number; amount: number | null; queued_at: string }> = []
  private snapshot = new Map<number, { item_id: number; name: string; price: number; qty: number }>()
  private nextSeq = 1
  private transaction:
    | {
        meta: Map<string, string>
        queue: Array<{ seq: number; action_type: 'consume' | 'restore'; item_id: number; amount: number | null; queued_at: string }>
        snapshot: Map<number, { item_id: number; name: string; price: number; qty: number }>
        nextSeq: number
      }
    | null = null

  async execute() {}

  async beginTransaction() {
    this.transaction = {
      meta: new Map(this.meta),
      queue: this.queue.map((row) => ({ ...row })),
      snapshot: new Map(Array.from(this.snapshot.entries()).map(([key, value]) => [key, { ...value }])),
      nextSeq: this.nextSeq
    }
  }

  async commitTransaction() {
    this.transaction = null
  }

  async rollbackTransaction() {
    if (!this.transaction) return
    this.meta = this.transaction.meta
    this.queue = this.transaction.queue
    this.snapshot = this.transaction.snapshot
    this.nextSeq = this.transaction.nextSeq
    this.transaction = null
  }

  async run(statement: string, values: Array<unknown> = []) {
    const query = statement.trim().toUpperCase()
    if (query.startsWith('DELETE FROM STORE_CART_QUEUE')) {
      this.queue = []
      return {}
    }
    if (query.startsWith('DELETE FROM STORE_CART_SNAPSHOT')) {
      this.snapshot.clear()
      return {}
    }
    if (query.startsWith('INSERT INTO STORE_LOCAL_META')) {
      const key = String(values[0] ?? '')
      const value = String(values[1] ?? '')
      this.meta.set(key, value)
      return {}
    }
    return {}
  }

  async executeSet(
    statements: Array<{
      statement: string
      values?: Array<unknown>
    }>
  ) {
    for (const entry of statements) {
      const query = entry.statement.trim().toUpperCase()
      const values = entry.values ?? []
      if (query.startsWith('CREATE TABLE IF NOT EXISTS')) {
        continue
      }
      if (query.startsWith('INSERT INTO STORE_CART_QUEUE')) {
        const type = values[0] === 'restore' ? 'restore' : 'consume'
        const itemId = Number(values[1] ?? 0)
        const amount = values[2] === null || values[2] === undefined ? null : Number(values[2])
        const queuedAt = String(values[3] ?? '')
        this.queue.push({
          seq: this.nextSeq++,
          action_type: type,
          item_id: itemId,
          amount: Number.isFinite(amount ?? NaN) ? amount : null,
          queued_at: queuedAt
        })
        continue
      }
      if (query.startsWith('INSERT INTO STORE_CART_SNAPSHOT')) {
        const itemId = Number(values[0] ?? 0)
        this.snapshot.set(itemId, {
          item_id: itemId,
          name: String(values[1] ?? ''),
          price: Number(values[2] ?? 0),
          qty: Number(values[3] ?? 0)
        })
      }
    }
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(statement: string, values: Array<unknown> = []) {
    const query = statement.trim().toUpperCase()
    if (query.startsWith('SELECT VALUE FROM STORE_LOCAL_META')) {
      const key = String(values[0] ?? '')
      const value = this.meta.get(key)
      return value ? ([{ value }] as unknown as T[]) : ([] as unknown as T[])
    }
    if (query.startsWith('SELECT COUNT(*) AS COUNT FROM STORE_CART_QUEUE')) {
      return [{ count: this.queue.length }] as unknown as T[]
    }
    if (query.startsWith('SELECT COUNT(*) AS COUNT FROM STORE_CART_SNAPSHOT')) {
      return [{ count: this.snapshot.size }] as unknown as T[]
    }
    if (query.startsWith('SELECT ACTION_TYPE, ITEM_ID, AMOUNT, QUEUED_AT FROM STORE_CART_QUEUE')) {
      const rows = this.queue
        .slice()
        .sort((left, right) => left.seq - right.seq)
        .map((row) => ({
          action_type: row.action_type,
          item_id: row.item_id,
          amount: row.amount,
          queued_at: row.queued_at
        }))
      return rows as unknown as T[]
    }
    if (query.startsWith('SELECT ITEM_ID, NAME, PRICE, QTY FROM STORE_CART_SNAPSHOT')) {
      const rows = Array.from(this.snapshot.values())
        .sort((left, right) => left.item_id - right.item_id)
        .map((row) => ({
          item_id: row.item_id,
          name: row.name,
          price: row.price,
          qty: row.qty
        }))
      return rows as unknown as T[]
    }
    return [] as unknown as T[]
  }
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('store local repo', () => {
  it('uses legacy storage when native runtime is disabled', async () => {
    const { map } = installWindow()
    const repo = createStoreLocalRepo({
      isNativeRuntime: () => false,
      isSQLiteAvailable: async () => true
    })

    await repo.init({
      queue: [{ type: 'consume', id: 7, queuedAt: '2026-01-01T00:00:00.000Z' }]
    })

    expect(await repo.getQueueSize()).toBe(1)
    expect(parseStoreCartQueue(map.get(storeCartQueueStorageKey) ?? null)).toHaveLength(1)
  })

  it('migrates to sqlite once and keeps migration idempotent', async () => {
    installWindow()
    const database = new FakeSQLiteDatabase()
    const runner = (async (_options: unknown, task: (db: unknown) => Promise<unknown>) => {
      return task(database)
    }) as unknown as (typeof import('../native/sqlite'))['withNativeSQLite']

    const repo = createStoreLocalRepo({
      isNativeRuntime: () => true,
      isSQLiteAvailable: async () => true,
      withSQLite: runner
    })

    await repo.init({
      queue: [{ type: 'consume', id: 1, queuedAt: '2026-01-02T00:00:00.000Z' }],
      snapshot: [{ id: 5, name: 'Seed item', price: 9.5, qty: 2 }]
    })

    await repo.init({
      queue: [{ type: 'consume', id: 99, queuedAt: '2026-01-03T00:00:00.000Z' }],
      snapshot: [{ id: 77, name: 'Replacement', price: 1.0, qty: 1 }]
    })

    const queue = await repo.readQueue()
    const snapshot = await repo.readSnapshot()
    expect(queue).toHaveLength(1)
    expect(queue[0]?.id).toBe(1)
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]?.id).toBe(5)
  })

  it('falls back to legacy storage when sqlite operation fails', async () => {
    const { map } = installWindow()
    const database = new FakeSQLiteDatabase()
    let runCount = 0
    const runner = (async (_options: unknown, task: (db: unknown) => Promise<unknown>) => {
      runCount += 1
      if (runCount === 2) {
        throw new Error('sqlite write failed')
      }
      return task(database)
    }) as unknown as (typeof import('../native/sqlite'))['withNativeSQLite']

    const repo = createStoreLocalRepo({
      isNativeRuntime: () => true,
      isSQLiteAvailable: async () => true,
      withSQLite: runner
    })

    await repo.init()
    await repo.writeQueue([{ type: 'consume', id: 42, queuedAt: '2026-01-04T00:00:00.000Z' }])

    const queue = await repo.readQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]?.id).toBe(42)
    expect(parseStoreCartQueue(map.get(storeCartQueueStorageKey) ?? null)).toHaveLength(1)
  })
})

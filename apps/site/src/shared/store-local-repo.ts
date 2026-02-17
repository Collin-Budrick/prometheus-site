import { isNativeSQLiteAvailable, withNativeSQLite, type NativeSQLiteDatabase } from '../native/sqlite'
import { isNativeCapacitorRuntime } from '../native/runtime'

export type StoreCartQueuedAction = {
  type: 'consume' | 'restore'
  id: number
  amount?: number
  queuedAt: string
}

export type StoreCartSnapshotItem = {
  id: number
  name: string
  price: number
  qty: number
}

export type StoreLocalSeed = {
  queue?: StoreCartQueuedAction[]
  snapshot?: StoreCartSnapshotItem[]
}

export type StoreLocalRepo = {
  init: (seed?: StoreLocalSeed) => Promise<void>
  readQueue: () => Promise<StoreCartQueuedAction[]>
  writeQueue: (queue: StoreCartQueuedAction[]) => Promise<void>
  readSnapshot: () => Promise<StoreCartSnapshotItem[]>
  writeSnapshot: (items: StoreCartSnapshotItem[]) => Promise<void>
  getQueueSize: () => Promise<number>
}

type StoreLocalRepoDependencies = {
  isNativeRuntime: () => boolean
  isSQLiteAvailable: () => Promise<boolean>
  withSQLite: typeof withNativeSQLite
}

type QueueEnvelope = {
  version: 1
  queue: StoreCartQueuedAction[]
}

type SnapshotEnvelope = {
  version: 1
  items: StoreCartSnapshotItem[]
}

type SQLiteQueueRow = {
  action_type?: unknown
  actionType?: unknown
  item_id?: unknown
  itemId?: unknown
  id?: unknown
  amount?: unknown
  queued_at?: unknown
  queuedAt?: unknown
}

type SQLiteSnapshotRow = {
  item_id?: unknown
  itemId?: unknown
  id?: unknown
  name?: unknown
  price?: unknown
  qty?: unknown
}

const storeCartQueueVersion = 1
const storeCartSnapshotVersion = 1
const sqliteDatabaseName = 'prometheus_store'
const sqliteVersion = 1
const sqliteMigrationGuardKey = 'legacy_migrated_v1'

export const storeCartQueueStorageKey = 'store-cart-queue'
export const storeCartSnapshotStorageKey = 'store-cart-snapshot'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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

const parseId = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

const normalizeQueueAction = (value: unknown): StoreCartQueuedAction | null => {
  if (!isRecord(value)) return null
  const type = value.type === 'consume' ? 'consume' : value.type === 'restore' ? 'restore' : null
  const id = parseId(value.id)
  const queuedAt = typeof value.queuedAt === 'string' ? value.queuedAt : ''
  const amount = value.amount !== undefined ? parseQuantity(value.amount) : undefined
  if (!type || id === null || queuedAt === '') return null
  if (type === 'restore') {
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0) return null
    return { type, id, amount, queuedAt }
  }
  return { type, id, queuedAt }
}

const normalizeSnapshotItem = (value: unknown): StoreCartSnapshotItem | null => {
  if (!isRecord(value)) return null
  const id = parseId(value.id)
  if (id === null) return null
  const name = typeof value.name === 'string' && value.name.trim() !== '' ? value.name : `Item ${id}`
  const price = parsePrice(value.price)
  const qty = parseQuantity(value.qty)
  if (!Number.isFinite(qty) || qty <= 0) return null
  return { id, name, price, qty }
}

const resolveQueuePayload = (value: unknown) => {
  if (Array.isArray(value)) return value
  if (isRecord(value) && value.version === storeCartQueueVersion && Array.isArray(value.queue)) {
    return value.queue
  }
  return null
}

const resolveSnapshotPayload = (value: unknown) => {
  if (Array.isArray(value)) return value
  if (isRecord(value) && value.version === storeCartSnapshotVersion && Array.isArray(value.items)) {
    return value.items
  }
  return null
}

export const serializeStoreCartQueue = (queue: StoreCartQueuedAction[]) =>
  JSON.stringify({
    version: storeCartQueueVersion,
    queue: queue.map((entry) => normalizeQueueAction(entry)).filter((entry): entry is StoreCartQueuedAction => entry !== null)
  } satisfies QueueEnvelope)

export const serializeStoreCartSnapshot = (items: StoreCartSnapshotItem[]) =>
  JSON.stringify({
    version: storeCartSnapshotVersion,
    items: items.map((entry) => normalizeSnapshotItem(entry)).filter((entry): entry is StoreCartSnapshotItem => entry !== null)
  } satisfies SnapshotEnvelope)

export const parseStoreCartQueue = (raw: string | null) => {
  if (!raw) return [] as StoreCartQueuedAction[]
  try {
    const parsed = JSON.parse(raw)
    const payload = resolveQueuePayload(parsed)
    if (!payload) return []
    return payload.map((entry) => normalizeQueueAction(entry)).filter((entry): entry is StoreCartQueuedAction => entry !== null)
  } catch {
    return []
  }
}

export const parseStoreCartSnapshot = (raw: string | null) => {
  if (!raw) return [] as StoreCartSnapshotItem[]
  try {
    const parsed = JSON.parse(raw)
    const payload = resolveSnapshotPayload(parsed)
    if (!payload) return []
    return payload.map((entry) => normalizeSnapshotItem(entry)).filter((entry): entry is StoreCartSnapshotItem => entry !== null)
  } catch {
    return []
  }
}

const readWebStorage = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeWebStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore localStorage failures
  }
}

const removeWebStorage = (key: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore localStorage failures
  }
}

const createLegacyStoreLocalRepo = (): StoreLocalRepo => {
  const applySeedIfMissing = (seed: StoreLocalSeed | undefined) => {
    if (!seed) return
    const existingQueue = parseStoreCartQueue(readWebStorage(storeCartQueueStorageKey))
    if (!existingQueue.length && seed.queue?.length) {
      writeWebStorage(storeCartQueueStorageKey, serializeStoreCartQueue(seed.queue))
    }

    const existingSnapshot = parseStoreCartSnapshot(readWebStorage(storeCartSnapshotStorageKey))
    if (!existingSnapshot.length && seed.snapshot?.length) {
      writeWebStorage(storeCartSnapshotStorageKey, serializeStoreCartSnapshot(seed.snapshot))
    }
  }

  return {
    async init(seed) {
      applySeedIfMissing(seed)
    },
    async readQueue() {
      return parseStoreCartQueue(readWebStorage(storeCartQueueStorageKey))
    },
    async writeQueue(queue) {
      const normalized = queue.map((entry) => normalizeQueueAction(entry)).filter((entry): entry is StoreCartQueuedAction => entry !== null)
      if (normalized.length) {
        writeWebStorage(storeCartQueueStorageKey, serializeStoreCartQueue(normalized))
      } else {
        removeWebStorage(storeCartQueueStorageKey)
      }
    },
    async readSnapshot() {
      return parseStoreCartSnapshot(readWebStorage(storeCartSnapshotStorageKey))
    },
    async writeSnapshot(items) {
      const normalized = items.map((entry) => normalizeSnapshotItem(entry)).filter((entry): entry is StoreCartSnapshotItem => entry !== null)
      if (normalized.length) {
        writeWebStorage(storeCartSnapshotStorageKey, serializeStoreCartSnapshot(normalized))
      } else {
        removeWebStorage(storeCartSnapshotStorageKey)
      }
    },
    async getQueueSize() {
      return parseStoreCartQueue(readWebStorage(storeCartQueueStorageKey)).length
    }
  }
}

const ensureSchema = async (database: NativeSQLiteDatabase) => {
  await database.executeSet([
    {
      statement:
        'CREATE TABLE IF NOT EXISTS store_local_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);'
    },
    {
      statement:
        "CREATE TABLE IF NOT EXISTS store_cart_queue (seq INTEGER PRIMARY KEY AUTOINCREMENT, action_type TEXT NOT NULL CHECK(action_type IN ('consume', 'restore')), item_id INTEGER NOT NULL, amount INTEGER, queued_at TEXT NOT NULL);"
    },
    {
      statement:
        'CREATE TABLE IF NOT EXISTS store_cart_snapshot (item_id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, qty INTEGER NOT NULL);'
    }
  ])
}

const readCount = async (database: NativeSQLiteDatabase, table: 'store_cart_queue' | 'store_cart_snapshot') => {
  const rows = await database.query<{ count?: unknown }>(`SELECT COUNT(*) AS count FROM ${table};`)
  const count = Number(rows[0]?.count ?? 0)
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
}

const readMetaValue = async (database: NativeSQLiteDatabase, key: string) => {
  const rows = await database.query<{ value?: unknown }>(
    'SELECT value FROM store_local_meta WHERE key = ? LIMIT 1;',
    [key]
  )
  const value = rows[0]?.value
  return typeof value === 'string' ? value : null
}

const writeMetaValue = async (database: NativeSQLiteDatabase, key: string, value: string) => {
  await database.run(
    'INSERT INTO store_local_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    [key, value]
  )
}

const replaceQueueRows = async (database: NativeSQLiteDatabase, queue: StoreCartQueuedAction[]) => {
  await database.run('DELETE FROM store_cart_queue;')
  if (!queue.length) return
  await database.executeSet(
    queue.map((entry) => ({
      statement: 'INSERT INTO store_cart_queue (action_type, item_id, amount, queued_at) VALUES (?, ?, ?, ?);',
      values: [entry.type, entry.id, entry.type === 'restore' ? (entry.amount ?? null) : null, entry.queuedAt]
    }))
  )
}

const replaceSnapshotRows = async (database: NativeSQLiteDatabase, items: StoreCartSnapshotItem[]) => {
  await database.run('DELETE FROM store_cart_snapshot;')
  if (!items.length) return
  await database.executeSet(
    items.map((item) => ({
      statement: 'INSERT INTO store_cart_snapshot (item_id, name, price, qty) VALUES (?, ?, ?, ?);',
      values: [item.id, item.name, item.price, item.qty]
    }))
  )
}

const readQueueRows = async (database: NativeSQLiteDatabase) => {
  const rows = await database.query<SQLiteQueueRow>(
    'SELECT action_type, item_id, amount, queued_at FROM store_cart_queue ORDER BY seq ASC;'
  )
  const normalized: StoreCartQueuedAction[] = []
  for (const row of rows) {
    const typeRaw = row.action_type ?? row.actionType
    const idRaw = row.item_id ?? row.itemId ?? row.id
    const queuedAtRaw = row.queued_at ?? row.queuedAt
    const type = typeRaw === 'restore' ? 'restore' : typeRaw === 'consume' ? 'consume' : null
    const id = parseId(idRaw)
    const queuedAt = typeof queuedAtRaw === 'string' ? queuedAtRaw : ''
    const amount = row.amount !== undefined ? parseQuantity(row.amount) : undefined
    if (!type || id === null || queuedAt === '') continue
    if (type === 'restore') {
      if (amount === undefined || amount <= 0) continue
      normalized.push({ type, id, amount, queuedAt })
      continue
    }
    normalized.push({ type, id, queuedAt })
  }
  return normalized
}

const readSnapshotRows = async (database: NativeSQLiteDatabase) => {
  const rows = await database.query<SQLiteSnapshotRow>(
    'SELECT item_id, name, price, qty FROM store_cart_snapshot ORDER BY item_id ASC;'
  )
  const normalized: StoreCartSnapshotItem[] = []
  for (const row of rows) {
    const idRaw = row.item_id ?? row.itemId ?? row.id
    const id = parseId(idRaw)
    if (id === null) continue
    const name = typeof row.name === 'string' && row.name.trim() !== '' ? row.name : `Item ${id}`
    const price = parsePrice(row.price)
    const qty = parseQuantity(row.qty)
    if (qty <= 0) continue
    normalized.push({ id, name, price, qty })
  }
  return normalized
}

const createSQLiteStoreLocalRepo = (sqliteRunner: typeof withNativeSQLite): StoreLocalRepo => {
  const runWithDb = async <T>(task: (database: NativeSQLiteDatabase) => Promise<T>): Promise<T> => {
    const result = await sqliteRunner(
      {
        database: sqliteDatabaseName,
        version: sqliteVersion
      },
      task
    )
    if (result === null) {
      throw new Error('Native SQLite unavailable')
    }
    return result
  }

  return {
    async init(seed) {
      const normalizedQueue = (seed?.queue ?? [])
        .map((entry) => normalizeQueueAction(entry))
        .filter((entry): entry is StoreCartQueuedAction => entry !== null)
      const normalizedSnapshot = (seed?.snapshot ?? [])
        .map((entry) => normalizeSnapshotItem(entry))
        .filter((entry): entry is StoreCartSnapshotItem => entry !== null)

      await runWithDb(async (database) => {
        await ensureSchema(database)
        await database.beginTransaction()
        try {
          const migrated = await readMetaValue(database, sqliteMigrationGuardKey)
          if (migrated !== '1') {
            const queueCount = await readCount(database, 'store_cart_queue')
            if (queueCount === 0 && normalizedQueue.length) {
              await replaceQueueRows(database, normalizedQueue)
            }

            const snapshotCount = await readCount(database, 'store_cart_snapshot')
            if (snapshotCount === 0 && normalizedSnapshot.length) {
              await replaceSnapshotRows(database, normalizedSnapshot)
            }

            await writeMetaValue(database, sqliteMigrationGuardKey, '1')
          }
          await database.commitTransaction()
        } catch (error) {
          await database.rollbackTransaction()
          throw error
        }
      })
    },
    async readQueue() {
      return runWithDb(async (database) => {
        await ensureSchema(database)
        return readQueueRows(database)
      })
    },
    async writeQueue(queue) {
      const normalized = queue.map((entry) => normalizeQueueAction(entry)).filter((entry): entry is StoreCartQueuedAction => entry !== null)
      await runWithDb(async (database) => {
        await ensureSchema(database)
        await database.beginTransaction()
        try {
          await replaceQueueRows(database, normalized)
          await database.commitTransaction()
        } catch (error) {
          await database.rollbackTransaction()
          throw error
        }
      })
    },
    async readSnapshot() {
      return runWithDb(async (database) => {
        await ensureSchema(database)
        return readSnapshotRows(database)
      })
    },
    async writeSnapshot(items) {
      const normalized = items.map((entry) => normalizeSnapshotItem(entry)).filter((entry): entry is StoreCartSnapshotItem => entry !== null)
      await runWithDb(async (database) => {
        await ensureSchema(database)
        await database.beginTransaction()
        try {
          await replaceSnapshotRows(database, normalized)
          await database.commitTransaction()
        } catch (error) {
          await database.rollbackTransaction()
          throw error
        }
      })
    },
    async getQueueSize() {
      return runWithDb(async (database) => {
        await ensureSchema(database)
        return readCount(database, 'store_cart_queue')
      })
    }
  }
}

const defaultDependencies: StoreLocalRepoDependencies = {
  isNativeRuntime: isNativeCapacitorRuntime,
  isSQLiteAvailable: isNativeSQLiteAvailable,
  withSQLite: withNativeSQLite
}

export const createStoreLocalRepo = (overrides: Partial<StoreLocalRepoDependencies> = {}): StoreLocalRepo => {
  const deps = { ...defaultDependencies, ...overrides }
  const legacy = createLegacyStoreLocalRepo()
  const sqlite = createSQLiteStoreLocalRepo(deps.withSQLite)
  let selected: 'undecided' | 'sqlite' | 'legacy' = 'undecided'
  let initialized = false
  let initSeed: StoreLocalSeed | undefined

  const selectRepo = async () => {
    if (selected !== 'undecided') return selected
    if (!deps.isNativeRuntime()) {
      selected = 'legacy'
      return selected
    }
    try {
      selected = (await deps.isSQLiteAvailable()) ? 'sqlite' : 'legacy'
    } catch {
      selected = 'legacy'
    }
    return selected
  }

  const fallbackToLegacy = async (seed?: StoreLocalSeed) => {
    selected = 'legacy'
    try {
      await legacy.init(seed)
    } catch {
      // ignore fallback init failures; callers will still hit legacy read/write guards.
    }
  }

  const ensureInitialized = async () => {
    if (initialized) return
    await repo.init(initSeed)
  }

  const withFailover = async <T>(sqliteTask: () => Promise<T>, legacyTask: () => Promise<T>) => {
    await ensureInitialized()
    if (selected === 'sqlite') {
      try {
        return await sqliteTask()
      } catch (error) {
        console.warn('StoreLocalRepo sqlite operation failed; falling back to legacy storage', error)
        await fallbackToLegacy()
      }
    }
    return legacyTask()
  }

  const repo: StoreLocalRepo = {
    async init(seed) {
      initSeed = seed
      const mode = await selectRepo()
      if (mode === 'sqlite') {
        try {
          await sqlite.init(seed)
          initialized = true
          return
        } catch (error) {
          console.warn('StoreLocalRepo sqlite init failed; falling back to legacy storage', error)
          await fallbackToLegacy(seed)
          initialized = true
          return
        }
      }
      await legacy.init(seed)
      initialized = true
    },
    async readQueue() {
      return withFailover(
        () => sqlite.readQueue(),
        () => legacy.readQueue()
      )
    },
    async writeQueue(queue) {
      await withFailover(
        () => sqlite.writeQueue(queue),
        () => legacy.writeQueue(queue)
      )
    },
    async readSnapshot() {
      return withFailover(
        () => sqlite.readSnapshot(),
        () => legacy.readSnapshot()
      )
    },
    async writeSnapshot(items) {
      await withFailover(
        () => sqlite.writeSnapshot(items),
        () => legacy.writeSnapshot(items)
      )
    },
    async getQueueSize() {
      return withFailover(
        () => sqlite.getQueueSize(),
        () => legacy.getQueueSize()
      )
    }
  }

  return repo
}


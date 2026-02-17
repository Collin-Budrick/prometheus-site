import { isNativeCapacitorRuntime } from './runtime'
import { loadNativePlugin } from './capacitor-plugin-loader'

type NativePlugin = Record<string, unknown>
type SQLiteModule = {
  CapacitorSQLite?: unknown
  SQLiteConnection?: new (plugin: unknown) => NativePlugin
}

type SQLiteResultRecord = Record<string, unknown>
type SQLiteValue = string | number | boolean | null | Uint8Array

export type SQLiteOpenOptions = {
  database: string
  version?: number
  readonly?: boolean
  encrypted?: boolean
  mode?: 'no-encryption' | 'encryption' | 'secret' | 'newsecret'
}

export type SQLiteStatement = {
  statement: string
  values?: SQLiteValue[]
}

export type SQLiteRunResult = {
  changes?: number
  lastId?: number
}

const SQLITE_MODULE_ID = '@capacitor-community/sqlite'
const defaultMode: NonNullable<SQLiteOpenOptions['mode']> = 'no-encryption'
const CALL_SUCCESS = Symbol('SQLITE_CALL_SUCCESS')

let sqliteManagerPromise: Promise<NativePlugin | null> | null = null

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseBooleanResult = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (!isObject(value)) return false
  if (typeof value.result === 'boolean') return value.result
  if (typeof value.value === 'boolean') return value.value
  return false
}

const parseArrayResult = <T>(value: unknown): T[] => {
  if (!isObject(value)) return []
  if (!Array.isArray(value.values)) return []
  return value.values as T[]
}

const parseRunResult = (value: unknown): SQLiteRunResult => {
  if (!isObject(value)) return {}
  const changes =
    typeof value.changes === 'number'
      ? value.changes
      : isObject(value.changes) && typeof value.changes.changes === 'number'
        ? value.changes.changes
        : undefined
  const lastId =
    typeof value.lastId === 'number'
      ? value.lastId
      : isObject(value.changes) && typeof value.changes.lastId === 'number'
        ? value.changes.lastId
        : undefined
  return { changes, lastId }
}

const callPluginMethod = async (plugin: NativePlugin, methodName: string, args: unknown[] = []) => {
  const method = plugin[methodName]
  if (typeof method !== 'function') return undefined
  const result = await method.call(plugin, ...args)
  return result === undefined ? CALL_SUCCESS : result
}

const callFirstSuccessful = async (plugin: NativePlugin, methodNames: string[], variants: unknown[][]) => {
  let lastError: unknown = null
  for (const methodName of methodNames) {
    const method = plugin[methodName]
    if (typeof method !== 'function') continue
    for (const args of variants) {
      try {
        return await callPluginMethod(plugin, methodName, args)
      } catch (error) {
        lastError = error
      }
    }
  }
  if (lastError) throw lastError
  return undefined
}

const loadSQLiteManager = async () => {
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return null
  if (sqliteManagerPromise) return sqliteManagerPromise

  sqliteManagerPromise = (async () => {
    const pluginModule = await loadNativePlugin<SQLiteModule>(SQLITE_MODULE_ID)
    const SQLiteConnection = pluginModule?.SQLiteConnection
    if (typeof SQLiteConnection !== 'function') return null
    if (!('CapacitorSQLite' in (pluginModule ?? {}))) return null

    try {
      return new SQLiteConnection(pluginModule?.CapacitorSQLite) as NativePlugin
    } catch {
      return null
    }
  })()

  const manager = await sqliteManagerPromise
  if (!manager) {
    sqliteManagerPromise = null
  }
  return manager
}

export const isNativeSQLiteAvailable = async () => {
  const manager = await loadSQLiteManager()
  return Boolean(manager)
}

export class NativeSQLiteDatabase {
  private readonly manager: NativePlugin
  private readonly db: NativePlugin
  private readonly database: string
  private readonly readonly: boolean
  private closed = false

  constructor(manager: NativePlugin, db: NativePlugin, database: string, readonly: boolean) {
    this.manager = manager
    this.db = db
    this.database = database
    this.readonly = readonly
  }

  private ensureOpen() {
    if (this.closed) {
      throw new Error(`SQLite database "${this.database}" is closed`)
    }
  }

  async execute(statement: string) {
    this.ensureOpen()
    await callFirstSuccessful(this.db, ['execute'], [[statement], [{ statements: statement }]])
  }

  async run(statement: string, values: SQLiteValue[] = []): Promise<SQLiteRunResult> {
    this.ensureOpen()
    const result = await callFirstSuccessful(this.db, ['run'], [[statement, values], [{ statement, values }]])
    return parseRunResult(result)
  }

  async query<Row extends SQLiteResultRecord = SQLiteResultRecord>(
    statement: string,
    values: SQLiteValue[] = []
  ): Promise<Row[]> {
    this.ensureOpen()
    const result = await callFirstSuccessful(this.db, ['query'], [[statement, values], [{ statement, values }]])
    return parseArrayResult<Row>(result)
  }

  async executeSet(statements: SQLiteStatement[]) {
    this.ensureOpen()
    if (!statements.length) return
    const set = statements.map((entry) => ({
      statement: entry.statement,
      values: entry.values ?? []
    }))
    await callFirstSuccessful(this.db, ['executeSet'], [[set], [{ set }]])
  }

  async beginTransaction() {
    await this.execute('BEGIN TRANSACTION;')
  }

  async commitTransaction() {
    await this.execute('COMMIT;')
  }

  async rollbackTransaction() {
    await this.execute('ROLLBACK;')
  }

  async close() {
    if (this.closed) return
    this.closed = true
    await callFirstSuccessful(this.db, ['close'], [[]])
    await callFirstSuccessful(
      this.manager,
      ['closeConnection'],
      [
        [this.database, this.readonly],
        [{ database: this.database, readonly: this.readonly }]
      ]
    )
  }
}

export const openNativeSQLite = async (options: SQLiteOpenOptions): Promise<NativeSQLiteDatabase | null> => {
  const manager = await loadSQLiteManager()
  if (!manager) return null

  const database = options.database.trim()
  if (!database) {
    throw new Error('SQLite database name is required')
  }

  const readonly = options.readonly === true
  const encrypted = options.encrypted === true
  const versionInput = options.version
  const version =
    typeof versionInput === 'number' && Number.isFinite(versionInput) ? Math.max(1, Math.trunc(versionInput)) : 1
  const mode = options.mode ?? defaultMode

  const consistency = await callFirstSuccessful(manager, ['checkConnectionsConsistency'], [[]])
  const consistencyOk = parseBooleanResult(consistency)
  const existing = await callFirstSuccessful(
    manager,
    ['isConnection'],
    [
      [database, readonly],
      [{ database, readonly }]
    ]
  )
  const hasConnection = parseBooleanResult(existing)

  const dbResult =
    consistencyOk && hasConnection
      ? await callFirstSuccessful(
          manager,
          ['retrieveConnection'],
          [
            [database, readonly],
            [{ database, readonly }]
          ]
        )
      : await callFirstSuccessful(
          manager,
          ['createConnection'],
          [
            [database, encrypted, mode, version, readonly],
            [{ database, encrypted, mode, version, readonly }]
          ]
        )

  if (!isObject(dbResult)) return null

  await callFirstSuccessful(dbResult, ['open'], [[]])
  return new NativeSQLiteDatabase(manager, dbResult, database, readonly)
}

export const withNativeSQLite = async <T>(
  options: SQLiteOpenOptions,
  task: (database: NativeSQLiteDatabase) => Promise<T>
): Promise<T | null> => {
  const database = await openNativeSQLite(options)
  if (!database) return null
  try {
    return await task(database)
  } finally {
    await database.close()
  }
}

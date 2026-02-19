import { loadNativePlugin } from './bridge'
import { isNativeShellRuntime } from './runtime'

export type SQLiteOpenOptions = {
  database: string
  version?: number
  readonly?: boolean
  encrypted?: boolean
  mode?: 'no-encryption' | 'encryption' | 'secret' | 'newsecret'
}

type SQLiteValue = string | number | boolean | null | Uint8Array

export type SQLiteStatement = {
  statement: string
  values?: SQLiteValue[]
}

export type SQLiteRunResult = {
  changes?: number
  lastId?: number
}

type SqlPluginDatabase = {
  execute: (statement: string, values?: SQLiteValue[]) => Promise<unknown>
  select: <Row = Record<string, unknown>>(statement: string, values?: SQLiteValue[]) => Promise<Row[]>
  close?: () => Promise<void>
}

type SqlPluginModule = {
  default?: {
    load?: (url: string) => Promise<SqlPluginDatabase>
  }
  load?: (url: string) => Promise<SqlPluginDatabase>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const buildDatabaseUrl = (options: SQLiteOpenOptions) => {
  const raw = options.database.trim()
  const base = raw.startsWith('sqlite:') ? raw : `sqlite:${raw}`
  const search = new URLSearchParams()
  if (options.readonly) search.set('mode', 'ro')
  if (options.version && Number.isFinite(options.version)) search.set('version', String(Math.trunc(options.version)))
  if (options.encrypted) search.set('encrypted', '1')
  if (options.mode) search.set('pragma_mode', options.mode)
  const query = search.toString()
  return query ? `${base}?${query}` : base
}

const resolveDatabaseLoader = async () => {
  if (!isNativeShellRuntime()) return null
  const mod = await loadNativePlugin<SqlPluginModule>('@tauri-apps/plugin-sql')
  const load = mod?.default?.load ?? mod?.load
  return typeof load === 'function' ? load : null
}

const parseRunResult = (value: unknown): SQLiteRunResult => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { changes: Math.max(0, Math.trunc(value)) }
  }
  if (isRecord(value)) {
    const changes = Number(value.changes)
    const lastId = Number(value.lastInsertId ?? value.lastId)
    const result: SQLiteRunResult = {}
    if (Number.isFinite(changes)) result.changes = Math.max(0, Math.trunc(changes))
    if (Number.isFinite(lastId)) result.lastId = Math.max(0, Math.trunc(lastId))
    return result
  }
  return {}
}

export const isNativeSQLiteAvailable = async () => Boolean(await resolveDatabaseLoader())

export class NativeSQLiteDatabase {
  private readonly database: string
  private readonly connection: SqlPluginDatabase

  constructor(database: string, connection: SqlPluginDatabase) {
    this.database = database
    this.connection = connection
  }

  private unavailable() {
    throw new Error(`Native SQLite is unavailable for "${this.database}"`)
  }

  async execute(statement: string) {
    if (!this.connection?.execute) this.unavailable()
    await this.connection.execute(statement)
  }

  async run(statement: string, values: SQLiteValue[] = []): Promise<SQLiteRunResult> {
    if (!this.connection?.execute) this.unavailable()
    const result = await this.connection.execute(statement, values)
    return parseRunResult(result)
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    values: SQLiteValue[] = []
  ): Promise<Row[]> {
    if (!this.connection?.select) this.unavailable()
    const rows = await this.connection.select<Row>(statement, values)
    return Array.isArray(rows) ? rows : []
  }

  async executeSet(statements: SQLiteStatement[]) {
    if (!this.connection?.execute) this.unavailable()
    for (const entry of statements) {
      await this.connection.execute(entry.statement, entry.values ?? [])
    }
  }

  async beginTransaction() {
    await this.execute('BEGIN IMMEDIATE')
  }

  async commitTransaction() {
    await this.execute('COMMIT')
  }

  async rollbackTransaction() {
    await this.execute('ROLLBACK')
  }

  async close() {
    if (typeof this.connection?.close !== 'function') return
    try {
      await this.connection.close()
    } catch {
      // ignore close failures
    }
  }
}

export const openNativeSQLite = async (options: SQLiteOpenOptions): Promise<NativeSQLiteDatabase | null> => {
  const database = options.database.trim()
  if (!database) return null
  const load = await resolveDatabaseLoader()
  if (!load) return null
  try {
    const connection = await load(buildDatabaseUrl(options))
    return new NativeSQLiteDatabase(database, connection)
  } catch {
    return null
  }
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

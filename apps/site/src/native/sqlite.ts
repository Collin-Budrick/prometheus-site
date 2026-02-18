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

export const isNativeSQLiteAvailable = async () => false

export class NativeSQLiteDatabase {
  private readonly database: string

  constructor(database: string) {
    this.database = database
  }

  private unavailable() {
    throw new Error(`Native SQLite is unavailable for "${this.database}"`)
  }

  async execute(_statement: string) {
    this.unavailable()
  }

  async run(_statement: string, _values: SQLiteValue[] = []): Promise<SQLiteRunResult> {
    this.unavailable()
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    _statement: string,
    _values: SQLiteValue[] = []
  ): Promise<Row[]> {
    this.unavailable()
  }

  async executeSet(_statements: SQLiteStatement[]) {
    this.unavailable()
  }

  async beginTransaction() {
    this.unavailable()
  }

  async commitTransaction() {
    this.unavailable()
  }

  async rollbackTransaction() {
    this.unavailable()
  }

  async close() {
    // no-op
  }
}

export const openNativeSQLite = async (_options: SQLiteOpenOptions): Promise<NativeSQLiteDatabase | null> => null

export const withNativeSQLite = async <T>(
  _options: SQLiteOpenOptions,
  _task: (database: NativeSQLiteDatabase) => Promise<T>
): Promise<T | null> => null

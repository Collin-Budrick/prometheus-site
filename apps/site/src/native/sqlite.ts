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

  private unavailable(): never {
    throw new Error(`Native SQLite is unavailable for "${this.database}"`)
  }

  async execute(statement: string) {
    void statement
    this.unavailable()
  }

  async run(statement: string, values: SQLiteValue[] = []): Promise<SQLiteRunResult> {
    void statement
    void values
    this.unavailable()
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    values: SQLiteValue[] = []
  ): Promise<Row[]> {
    void statement
    void values
    this.unavailable()
  }

  async executeSet(statements: SQLiteStatement[]) {
    void statements
    this.unavailable()
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
    return
  }
}

export const openNativeSQLite = async (options: SQLiteOpenOptions): Promise<NativeSQLiteDatabase | null> => {
  void options
  return null
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

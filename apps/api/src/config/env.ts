type PostgresConfig = {
  connectionString: string
  ssl: false | 'require'
  connectRetries: number
  backoffMs: number
}

type ValkeyConfig = {
  host: string
  port: number
}

type AppConfig = {
  postgres: PostgresConfig
  valkey: ValkeyConfig
}

type Env = Record<string, string | undefined>

const parsePort = (value: string | undefined, defaultValue: number, name: string) => {
  const raw = (value ?? String(defaultValue)).trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }

  const parsed = Number.parseInt(raw, 10)

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }

  return parsed
}

const parseNonNegativeInt = (value: string | undefined, defaultValue: number, name: string) => {
  const raw = (value ?? String(defaultValue)).trim()
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  const parsed = Number.parseInt(raw, 10)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  return parsed
}

const parseBooleanFlag = (value: string | undefined, defaultValue: boolean, name: string) => {
  if (value === undefined) return defaultValue
  if (value === 'true') return true
  if (value === 'false') return false

  throw new Error(`${name} must be either 'true' or 'false'`)
}

const ensureString = (value: string | undefined, defaultValue: string, name: string) => {
  const resolved = (value ?? defaultValue).trim()
  if (!resolved) {
    throw new Error(`${name} is required`)
  }
  return resolved
}

const buildConnectionString = (env: Env) => {
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL)
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        throw new Error('Invalid protocol')
      }
      return url.toString()
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown'
      throw new Error(`DATABASE_URL is invalid: ${reason}`)
    }
  }

  const user = ensureString(env.POSTGRES_USER, 'prometheus', 'POSTGRES_USER')
  const password = ensureString(env.POSTGRES_PASSWORD, 'secret', 'POSTGRES_PASSWORD')
  const host = ensureString(env.POSTGRES_HOST, 'localhost', 'POSTGRES_HOST')
  const port = parsePort(env.POSTGRES_PORT, 5433, 'POSTGRES_PORT')
  const db = ensureString(env.POSTGRES_DB, 'prometheus', 'POSTGRES_DB')

  return `postgresql://${user}:${password}@${host}:${port}/${db}`
}

export const loadConfig = (env: Env = process.env): AppConfig => {
  const connectionString = buildConnectionString(env)
  const ssl = parseBooleanFlag(env.POSTGRES_SSL, false, 'POSTGRES_SSL') ? 'require' : false
  const connectRetries = parseNonNegativeInt(env.DB_CONNECT_RETRIES, 5, 'DB_CONNECT_RETRIES')
  const backoffMs = parseNonNegativeInt(env.DB_CONNECT_BACKOFF_MS, 200, 'DB_CONNECT_BACKOFF_MS')

  const valkeyHost = ensureString(env.VALKEY_HOST, 'localhost', 'VALKEY_HOST')
  const valkeyPort = parsePort(env.VALKEY_PORT, 6379, 'VALKEY_PORT')

  return {
    postgres: {
      connectionString,
      ssl,
      connectRetries,
      backoffMs
    },
    valkey: {
      host: valkeyHost,
      port: valkeyPort
    }
  }
}

export const config = loadConfig()

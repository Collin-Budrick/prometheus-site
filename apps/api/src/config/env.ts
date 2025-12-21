const DEFAULT_POSTGRES_HOST = 'localhost'
const DEFAULT_POSTGRES_PORT = 5433
const DEFAULT_POSTGRES_USER = 'prometheus'
const DEFAULT_POSTGRES_PASSWORD = 'secret'
const DEFAULT_POSTGRES_DB = 'prometheus'
const DEFAULT_POSTGRES_SSL = false

const DEFAULT_VALKEY_HOST = 'localhost'
const DEFAULT_VALKEY_PORT = 6379

const parsePort = (value: string | undefined, defaultValue: number, name: string) => {
  if (value === undefined) return defaultValue

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return parsed
}

const parseBooleanString = (value: string | undefined, name: string) => {
  if (value === undefined) return DEFAULT_POSTGRES_SSL
  if (value === 'true') return true
  if (value === 'false') return false

  throw new Error(`${name} must be either "true" or "false"`)
}

const requireValue = (value: string | undefined, name: string, fallback: string) => {
  if (value === undefined) return fallback
  if (value.trim() === '') {
    throw new Error(`${name} cannot be empty`)
  }

  return value
}

export type PostgresConfig = {
  connectionString: string
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean
}

export type ValkeyConfig = {
  host: string
  port: number
}

export type AppConfig = {
  postgres: PostgresConfig
  valkey: ValkeyConfig
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = requireValue(env.POSTGRES_HOST, 'POSTGRES_HOST', DEFAULT_POSTGRES_HOST)
  const port = parsePort(env.POSTGRES_PORT, DEFAULT_POSTGRES_PORT, 'POSTGRES_PORT')
  const user = requireValue(env.POSTGRES_USER, 'POSTGRES_USER', DEFAULT_POSTGRES_USER)
  const password = requireValue(env.POSTGRES_PASSWORD, 'POSTGRES_PASSWORD', DEFAULT_POSTGRES_PASSWORD)
  const database = requireValue(env.POSTGRES_DB, 'POSTGRES_DB', DEFAULT_POSTGRES_DB)
  const ssl = parseBooleanString(env.POSTGRES_SSL, 'POSTGRES_SSL')

  const connectionString = env.DATABASE_URL ?? `postgresql://${user}:${password}@${host}:${port}/${database}`
  if (connectionString.trim() === '') {
    throw new Error('DATABASE_URL cannot be empty when provided')
  }

  const valkeyHost = requireValue(env.VALKEY_HOST, 'VALKEY_HOST', DEFAULT_VALKEY_HOST)
  const valkeyPort = parsePort(env.VALKEY_PORT, DEFAULT_VALKEY_PORT, 'VALKEY_PORT')

  return {
    postgres: {
      connectionString,
      host,
      port,
      user,
      password,
      database,
      ssl
    },
    valkey: {
      host: valkeyHost,
      port: valkeyPort
    }
  }
}

export const config = loadConfig()

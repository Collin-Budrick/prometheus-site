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

type OAuthProvider = 'google' | 'github' | 'apple' | 'discord' | 'microsoft'

type OAuthClient = {
  clientId: string
  clientSecret: string
}

type AuthConfig = {
  cookieSecret: string
  rpId: string
  rpOrigin: string
  oauth: Partial<Record<OAuthProvider, OAuthClient>>
}

type AppConfig = {
  postgres: PostgresConfig
  valkey: ValkeyConfig
  auth: AuthConfig
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

const parseOAuthProvider = (env: Env, provider: OAuthProvider, providerLabel: string): OAuthClient | null => {
  const providerKey = provider.toUpperCase()
  const clientIdKey = `BETTER_AUTH_${providerKey}_CLIENT_ID`
  const clientSecretKey = `BETTER_AUTH_${providerKey}_CLIENT_SECRET`
  const clientId = env[clientIdKey]?.trim()
  const clientSecret = env[clientSecretKey]?.trim()

  if (!clientId && !clientSecret) return null
  if (!clientId || !clientSecret) {
    throw new Error(`${providerLabel} OAuth requires both ${clientIdKey} and ${clientSecretKey}`)
  }

  return { clientId, clientSecret }
}

const parseAuthConfig = (env: Env): AuthConfig => {
  const cookieSecret = ensureString(env.BETTER_AUTH_COOKIE_SECRET, 'dev-cookie-secret', 'BETTER_AUTH_COOKIE_SECRET')
  const rpId = ensureString(env.BETTER_AUTH_RP_ID, 'localhost', 'BETTER_AUTH_RP_ID')
  const rpOrigin = ensureString(
    env.BETTER_AUTH_RP_ORIGIN ?? env.BETTER_AUTH_ORIGIN ?? env.PRERENDER_ORIGIN,
    'https://localhost:4173',
    'BETTER_AUTH_RP_ORIGIN'
  )

  const oauth: AuthConfig['oauth'] = {}
  const providers: Array<[OAuthProvider, string]> = [
    ['google', 'Google'],
    ['github', 'GitHub'],
    ['apple', 'Apple'],
    ['discord', 'Discord'],
    ['microsoft', 'Microsoft']
  ]

  for (const [provider, label] of providers) {
    const config = parseOAuthProvider(env, provider, label)
    if (config) oauth[provider] = config
  }

  return { cookieSecret, rpId, rpOrigin, oauth }
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
  const auth = parseAuthConfig(env)

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
    },
    auth
  }
}

export const config = loadConfig()

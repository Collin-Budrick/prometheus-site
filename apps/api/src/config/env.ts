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

const requireString = (value: string | undefined, name: string) => {
  const resolved = value?.trim() ?? ''
  if (!resolved) {
    throw new Error(`${name} is required`)
  }
  return resolved
}

const resolveAuthString = (
  value: string | undefined,
  fallback: string,
  name: string,
  allowDevDefaults: boolean
) => (allowDevDefaults ? ensureString(value, fallback, name) : requireString(value, name))

const resolveWebProtocol = (env: Env) => {
  const hmrProtocol = env.HMR_PROTOCOL?.trim().toLowerCase()
  if (hmrProtocol === 'wss') return 'https'
  if (hmrProtocol === 'ws') return 'http'
  const webProtocol = env.WEB_PROTOCOL?.trim().toLowerCase()
  if (webProtocol === 'https' || webProtocol === 'http') return webProtocol
  return 'https'
}

const resolveDevRpId = (env: Env) => {
  const inferred = env.HMR_HOST?.trim() || env.WEB_HOST?.trim()
  if (inferred && inferred !== 'localhost') return inferred
  return 'localhost'
}

const resolveRpId = (env: Env, allowDevDefaults: boolean) => {
  const explicit = env.BETTER_AUTH_RP_ID?.trim()
  if (!allowDevDefaults) return requireString(explicit, 'BETTER_AUTH_RP_ID')
  if (explicit && explicit !== 'localhost') return explicit
  const fallback = resolveDevRpId(env)
  if (explicit === 'localhost' && fallback !== 'localhost') return fallback
  return explicit || fallback
}

const resolveRpOrigin = (env: Env, allowDevDefaults: boolean, rpId: string) => {
  const explicit = (env.BETTER_AUTH_RP_ORIGIN ?? env.BETTER_AUTH_ORIGIN ?? env.PRERENDER_ORIGIN)?.trim()
  if (!allowDevDefaults) return requireString(explicit, 'BETTER_AUTH_RP_ORIGIN')

  const protocol = resolveWebProtocol(env)
  const webPort = (env.WEB_PORT?.trim() || '4173').replace(/^:/, '')
  const localhostOrigin = `${protocol}://localhost:${webPort}`

  if (explicit && explicit !== localhostOrigin) return explicit
  if (rpId !== 'localhost') return `${protocol}://${rpId}`
  return explicit || localhostOrigin
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

const parseAuthConfig = (env: Env, allowDevDefaults: boolean): AuthConfig => {
  const resolvedSecret = env.BETTER_AUTH_SECRET ?? env.BETTER_AUTH_COOKIE_SECRET
  const secretName = env.BETTER_AUTH_SECRET ? 'BETTER_AUTH_SECRET' : 'BETTER_AUTH_COOKIE_SECRET'
  const cookieSecret = resolveAuthString(
    resolvedSecret,
    'dev-cookie-secret-please-change-32',
    secretName,
    allowDevDefaults
  )
  const rpId = resolveRpId(env, allowDevDefaults)
  const rpOrigin = resolveRpOrigin(env, allowDevDefaults, rpId)

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
  const nodeEnv = env.NODE_ENV?.trim()
  const allowDevDefaults = nodeEnv !== 'production'
  const connectionString = buildConnectionString(env)
  const ssl = parseBooleanFlag(env.POSTGRES_SSL, false, 'POSTGRES_SSL') ? 'require' : false
  const connectRetries = parseNonNegativeInt(env.DB_CONNECT_RETRIES, 5, 'DB_CONNECT_RETRIES')
  const backoffMs = parseNonNegativeInt(env.DB_CONNECT_BACKOFF_MS, 200, 'DB_CONNECT_BACKOFF_MS')

  const valkeyHost = ensureString(env.VALKEY_HOST, 'localhost', 'VALKEY_HOST')
  const valkeyPort = parsePort(env.VALKEY_PORT, 6379, 'VALKEY_PORT')
  const auth = parseAuthConfig(env, allowDevDefaults)

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

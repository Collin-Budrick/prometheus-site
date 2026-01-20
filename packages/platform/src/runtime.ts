export type Env = Record<string, string | undefined>

type RuntimeEnv = {
  RUN_MIGRATIONS?: string
  ENABLE_WEBTRANSPORT_FRAGMENTS?: string
  NODE_ENV?: string
}

const pickRuntimeEnv = (env: Env): RuntimeEnv => ({
  RUN_MIGRATIONS: env.RUN_MIGRATIONS,
  ENABLE_WEBTRANSPORT_FRAGMENTS: env.ENABLE_WEBTRANSPORT_FRAGMENTS,
  NODE_ENV: env.NODE_ENV
})

const truthyValues = new Set(['1', 'true', 'yes', 'on'])
const falsyValues = new Set(['0', 'false', 'no', 'off'])

export const resolveBooleanFlag = (value: string | undefined, defaultValue = false) => {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (normalized === '') return defaultValue
  if (truthyValues.has(normalized)) return true
  if (falsyValues.has(normalized)) return false
  return defaultValue
}

export const resolveEnvironment = (rawValue: string | undefined) => {
  const normalized = rawValue?.trim() ?? ''
  return normalized === '' ? 'development' : normalized
}

export type RuntimeFlags = {
  runMigrations: boolean
  enableWebTransportFragments: boolean
}

export const resolveRuntimeFlags = (
  env: Env,
  defaults?: Partial<RuntimeFlags>
): RuntimeFlags => {
  const runtimeEnv = pickRuntimeEnv(env)
  const runMigrations = resolveBooleanFlag(runtimeEnv.RUN_MIGRATIONS, defaults?.runMigrations ?? false)
  const enableWebTransportFragments = resolveBooleanFlag(
    runtimeEnv.ENABLE_WEBTRANSPORT_FRAGMENTS,
    defaults?.enableWebTransportFragments ?? runtimeEnv.NODE_ENV !== 'production'
  )

  return {
    runMigrations,
    enableWebTransportFragments
  }
}

export type Env = Record<string, string | undefined>

type RuntimeEnv = {
  ENABLE_WEBTRANSPORT_FRAGMENTS?: string
  NODE_ENV?: string
}

const pickRuntimeEnv = (env: Env): RuntimeEnv => ({
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
  enableWebTransportFragments: boolean
}

export const resolveRuntimeFlags = (
  env: Env,
  defaults?: Partial<RuntimeFlags>
): RuntimeFlags => {
  const runtimeEnv = pickRuntimeEnv(env)
  const enableWebTransportFragments = resolveBooleanFlag(
    runtimeEnv.ENABLE_WEBTRANSPORT_FRAGMENTS,
    defaults?.enableWebTransportFragments ?? runtimeEnv.NODE_ENV !== 'production'
  )

  return {
    enableWebTransportFragments
  }
}

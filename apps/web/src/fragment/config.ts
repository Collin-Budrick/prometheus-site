import {
  DEFAULT_DEV_API_BASE,
  isFragmentCompressionPreferred,
  isWebTransportDatagramsPreferred,
  isWebTransportPreferred,
  normalizeApiBase,
  resolveApiBase,
  resolveAppConfig,
  resolveRuntimeEnv,
  resolveWebTransportBase,
  type AppConfig,
  type AppEnv
} from '@platform/env'

export type EnvConfig = AppEnv
export type { AppConfig } from '@platform/env'

export const getEnv = (): EnvConfig => resolveRuntimeEnv()

export { DEFAULT_DEV_API_BASE, normalizeApiBase }

export const getApiBase = (env: EnvConfig = getEnv()) => resolveApiBase(env)
export const getWebTransportBase = (env: EnvConfig = getEnv()) => resolveWebTransportBase(env)
export const getAppConfig = (env: EnvConfig = getEnv()): AppConfig => resolveAppConfig(env)

export {
  isFragmentCompressionPreferred,
  isWebTransportDatagramsPreferred,
  isWebTransportPreferred
}

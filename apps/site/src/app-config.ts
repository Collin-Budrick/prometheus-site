import { resolveAppConfig, type AppConfig, type AppEnv } from '@platform/env'

declare const __PUBLIC_APP_CONFIG__: AppConfig | undefined

const resolveFallbackConfig = () => {
  if (typeof process === 'undefined') return undefined
  return resolveAppConfig(process.env as AppEnv)
}

const fallbackConfig = resolveFallbackConfig()

if (!__PUBLIC_APP_CONFIG__ && !fallbackConfig) {
  throw new Error('Public app config is not available in this runtime.')
}

export const appConfig: AppConfig = __PUBLIC_APP_CONFIG__ ?? fallbackConfig!

import type { AppConfig } from '@platform/env'

declare const __PUBLIC_APP_CONFIG__: AppConfig | undefined

if (!__PUBLIC_APP_CONFIG__) {
  throw new Error('Public app config is not available in this runtime.')
}

export const appConfig: AppConfig = __PUBLIC_APP_CONFIG__

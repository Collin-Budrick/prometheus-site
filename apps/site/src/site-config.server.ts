import { resolveAppConfig, type AppConfig } from '@platform/config'

export type { AppConfig }

export const appConfig: AppConfig = resolveAppConfig()

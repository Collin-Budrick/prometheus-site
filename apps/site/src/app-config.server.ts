import { resolveAppConfig, type AppConfig } from '@platform/env'

export type { AppConfig }

export const appConfig: AppConfig = resolveAppConfig()

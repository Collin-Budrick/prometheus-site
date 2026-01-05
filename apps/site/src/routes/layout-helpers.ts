import type { AppConfig } from '../../web/src/fragment/config'

export const resolveApiBase = (config: Pick<AppConfig, 'apiBase'>) => config.apiBase

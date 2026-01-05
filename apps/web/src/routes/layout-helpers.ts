import type { AppConfig } from '../fragment/config'

export const resolveApiBase = (config: Pick<AppConfig, 'apiBase'>) => config.apiBase

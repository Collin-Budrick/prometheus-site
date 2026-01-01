import { getApiBase } from '../fragment/config'
import type { EnvConfig } from '../fragment/config'

export const resolveApiBase = (env?: EnvConfig) => getApiBase(env)

import { getApiBase } from '../../web/src/fragment/config'
import type { EnvConfig } from '../../web/src/fragment/config'

export const resolveApiBase = (env?: EnvConfig) => getApiBase(env)


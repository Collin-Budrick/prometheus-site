import { getApiBase } from '../fragment/config'
import type { EnvConfig } from '../fragment/config'

export const resolveApiBase = (env?: EnvConfig) => getApiBase(env)

export const resolveSpeculationRules = (env?: EnvConfig) => {
  const apiBase = getApiBase(env)

  if (!apiBase) {
    return null
  }

  return {
    prefetch: [
      {
        source: 'list',
        urls: [
          `${apiBase}/fragments/plan?path=/`,
          `${apiBase}/fragments/stream?path=/`
        ]
      }
    ]
  }
}

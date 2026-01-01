type EnvConfig = Record<string, string | undefined>

const getEnv = (): EnvConfig => (import.meta as ImportMeta & { env?: EnvConfig }).env ?? {}

export const resolveApiBase = (env: EnvConfig = getEnv()) => {
  const base = env.VITE_API_BASE?.trim()

  if (!base) {
    return ''
  }

  try {
    const url = new URL(base)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ''
    }

    const normalizedPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
    return `${url.origin}${normalizedPath}`
  } catch {
    return ''
  }
}

export const resolveSpeculationRules = (env?: EnvConfig) => {
  const apiBase = resolveApiBase(env)

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

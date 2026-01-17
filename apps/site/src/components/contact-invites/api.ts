import { appConfig } from '../../app-config'

const resolveApiBase = (origin: string, apiBase?: string) => {
  const base = apiBase ?? appConfig.apiBase
  if (!base) return ''
  if (base.startsWith('/')) return base
  try {
    return new URL(base).toString()
  } catch {
    return ''
  }
}

export const buildApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = resolveApiBase(origin, apiBase)
  if (!base) return `${origin}${path}`

  if (base.startsWith('/')) {
    if (path.startsWith(base)) return `${origin}${path}`
    return `${origin}${base}${path}`
  }

  if (path.startsWith('/api')) {
    const normalizedBase = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${normalizedBase}${path}`
  }

  return `${base}${path}`
}

export const resolveApiHost = (origin: string, apiBase?: string) => {
  const base = resolveApiBase(origin, apiBase)
  if (!base || base.startsWith('/')) {
    try {
      return new URL(origin).host
    } catch {
      return ''
    }
  }
  try {
    return new URL(base).host
  } catch {
    return ''
  }
}

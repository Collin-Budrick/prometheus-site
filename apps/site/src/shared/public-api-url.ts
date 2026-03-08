type PublicAppConfig = {
  apiBase?: string
}

type PublicAppConfigTarget = typeof globalThis & {
  __PUBLIC_APP_CONFIG__?: PublicAppConfig | undefined
}

const normalizePublicApiBase = (value?: string) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

const getPublicAppConfig = () => {
  if (typeof globalThis !== 'object') return undefined
  const config = (globalThis as PublicAppConfigTarget).__PUBLIC_APP_CONFIG__
  return config && typeof config === 'object' ? config : undefined
}

const resolveConfiguredApiBase = () => normalizePublicApiBase(getPublicAppConfig()?.apiBase)

export const resolvePublicApiBase = () => resolveConfiguredApiBase() || '/api'

export const buildPublicApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = normalizePublicApiBase(apiBase) || resolvePublicApiBase()
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

export const resolvePublicApiHost = (origin: string, apiBase?: string) => {
  const base = normalizePublicApiBase(apiBase) || resolvePublicApiBase()
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

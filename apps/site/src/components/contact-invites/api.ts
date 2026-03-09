import { buildPublicApiUrl, resolvePublicApiBase, resolvePublicApiHost } from '../../shared/public-api-url'

const resolveApiBase = (origin: string, apiBase?: string) => {
  const base = apiBase ?? resolvePublicApiBase()
  if (!base) return ''
  if (base.startsWith('/')) return base
  try {
    return new URL(base).toString()
  } catch (error) {
    console.warn('Failed to resolve contact invites API base:', error)
    return ''
  }
}

export const buildApiUrl = (path: string, origin: string, apiBase?: string) => {
  return buildPublicApiUrl(path, origin, resolveApiBase(origin, apiBase))
}

export const resolveApiHost = (origin: string, apiBase?: string) => resolvePublicApiHost(origin, apiBase)

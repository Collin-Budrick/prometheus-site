import { normalizeApiBase, resolveApiBase } from '@platform/env'

const isAbsoluteUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://')

const resolveOrigin = (request?: Request) => {
  if (!request) return ''
  try {
    return new URL(request.url).origin
  } catch {
    return ''
  }
}

export const resolveServerApiBase = (apiBase: string, request?: Request) => {
  const normalized = normalizeApiBase(apiBase)
  const runtimeApiBase = resolveApiBase()
  if (runtimeApiBase && isAbsoluteUrl(runtimeApiBase)) return runtimeApiBase
  if (normalized && isAbsoluteUrl(normalized)) return normalized

  const origin = resolveOrigin(request)
  const relative = normalized || (runtimeApiBase && !isAbsoluteUrl(runtimeApiBase) ? runtimeApiBase : '')
  if (origin && relative) {
    return `${origin}${relative.startsWith('/') ? relative : `/${relative}`}`
  }

  return normalized || runtimeApiBase
}

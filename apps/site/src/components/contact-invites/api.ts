import { appConfig } from '../../app-config'
import { isRecord } from './utils'

export const buildApiUrl = (path: string, origin: string) => {
  const base = appConfig.apiBase
  if (!base) return `${origin}${path}`
  if (base.startsWith('/')) return `${origin}${base}${path}`
  return `${base}${path}`
}

export const buildWsUrl = (path: string, origin: string) => {
  const httpUrl = buildApiUrl(path, origin)
  if (!httpUrl) return ''
  const url = new URL(httpUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export const resolveChatSettingsUserId = async () => {
  if (typeof window === 'undefined') return undefined
  try {
    const response = await fetch(buildApiUrl('/auth/session', window.location.origin), {
      credentials: 'include'
    })
    if (!response.ok) return undefined
    const payload: unknown = await response.json()
    if (!isRecord(payload)) return undefined
    const userRecord = isRecord(payload.user) ? payload.user : {}
    const sessionRecord = isRecord(payload.session) ? payload.session : {}
    const id =
      typeof userRecord.id === 'string'
        ? userRecord.id
        : typeof sessionRecord.userId === 'string'
          ? sessionRecord.userId
          : undefined
    return id
  } catch {
    return undefined
  }
}

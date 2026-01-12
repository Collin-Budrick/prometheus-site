import { appConfig } from '../../app-config'
import { buildApiUrl } from './api'
import { isRecord } from './utils'

export type RelaySendRequest = {
  recipientId: string
  messageId: string
  sessionId?: string
  payload: unknown
  ttlSeconds?: number
  deviceIds?: string[]
}

export type RelaySendResult = {
  id: string
  delivered: number
}

export type RelayPullRequest = {
  deviceId: string
  limit?: number
}

export type RelayMessage = {
  id: string
  from: string
  to: string
  deviceId: string
  sessionId?: string
  payload: unknown
  createdAt: string
  relayBase: string
}

export type RelayClient = {
  baseUrl: string
  send: (request: RelaySendRequest) => Promise<RelaySendResult | null>
  pull: (request: RelayPullRequest) => Promise<RelayMessage[]>
  ack: (deviceId: string, messageIds: string[]) => Promise<number>
}

const normalizeBase = (value: string, origin: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('/')) {
    return `${origin}${trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed}`
  }
  try {
    const url = new URL(trimmed)
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
    return `${url.origin}${pathname}`
  } catch {
    return ''
  }
}

const resolveRelayBases = (origin: string) => {
  const configured = appConfig.p2pRelayBases ?? []
  const resolved = configured.map((entry) => normalizeBase(entry, origin)).filter(Boolean)
  if (resolved.length) return resolved
  return [buildApiUrl('', origin)]
}

const buildRelayUrl = (baseUrl: string, path: string) => {
  const relative = path.replace(/^\/+/, '')
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(relative, base).toString()
}

const isSameOrigin = (baseUrl: string, origin: string) => {
  try {
    return new URL(baseUrl).origin === new URL(origin).origin
  } catch {
    return false
  }
}

const parseSendResult = (payload: unknown): RelaySendResult | null => {
  if (!isRecord(payload)) return null
  const id = typeof payload.id === 'string' ? payload.id : ''
  if (!id) return null
  const delivered = typeof payload.delivered === 'number' ? payload.delivered : 0
  return { id, delivered }
}

const parseMessages = (payload: unknown, relayBase: string) => {
  if (!isRecord(payload)) return []
  const raw = payload.messages
  if (!Array.isArray(raw)) return []
  const messages: RelayMessage[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const id = typeof entry.id === 'string' ? entry.id : ''
    const from = typeof entry.from === 'string' ? entry.from : ''
    const to = typeof entry.to === 'string' ? entry.to : ''
    const deviceId = typeof entry.deviceId === 'string' ? entry.deviceId : ''
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : ''
    if (!id || !from || !to || !deviceId || !createdAt) continue
    messages.push({
      id,
      from,
      to,
      deviceId,
      sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : undefined,
      payload: entry.payload,
      createdAt,
      relayBase
    })
  }
  return messages
}

const parseAckResult = (payload: unknown) => {
  if (!isRecord(payload)) return 0
  const removed = payload.removed
  return typeof removed === 'number' ? removed : 0
}

export const createRelayClients = (origin: string): RelayClient[] => {
  const bases = resolveRelayBases(origin)

  return bases.map((baseUrl) => {
    const credentials = isSameOrigin(baseUrl, origin) ? 'include' : 'omit'
    const send = async (request: RelaySendRequest) => {
      try {
        const response = await fetch(buildRelayUrl(baseUrl, '/chat/p2p/mailbox/send'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials,
          body: JSON.stringify(request)
        })
        if (!response.ok) return null
        return parseSendResult(await response.json())
      } catch {
        return null
      }
    }

    const pull = async (request: RelayPullRequest) => {
      try {
        const response = await fetch(buildRelayUrl(baseUrl, '/chat/p2p/mailbox/pull'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials,
          body: JSON.stringify(request)
        })
        if (!response.ok) return []
        return parseMessages(await response.json(), baseUrl)
      } catch {
        return []
      }
    }

    const ack = async (deviceId: string, messageIds: string[]) => {
      if (!messageIds.length) return 0
      try {
        const response = await fetch(buildRelayUrl(baseUrl, '/chat/p2p/mailbox/ack'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials,
          body: JSON.stringify({ deviceId, messageIds })
        })
        if (!response.ok) return 0
        return parseAckResult(await response.json())
      } catch {
        return 0
      }
    }

    return {
      baseUrl,
      send,
      pull,
      ack
    } satisfies RelayClient
  })
}

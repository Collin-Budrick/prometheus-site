import { SimplePool, finalizeEvent } from 'nostr-tools'
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
  senderId?: string
  senderDeviceId?: string
  recipientRelayKey?: string
}

export type RelaySendResult = {
  id: string
  delivered: number
}

export type RelayPullRequest = {
  deviceId: string
  limit?: number
  relayPublicKey?: string
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
  relayKind?: 'http' | 'nostr'
}

export type RelayIdentity = {
  publicKey: string
  secretKey: string
}

export type RelayClient = {
  baseUrl: string
  kind: 'http' | 'nostr'
  send: (request: RelaySendRequest) => Promise<RelaySendResult | null>
  pull: (request: RelayPullRequest) => Promise<RelayMessage[]>
  ack: (deviceId: string, messageIds: string[]) => Promise<number>
}

export type RelayManager = {
  clients: RelayClient[]
  send: (request: RelaySendRequest) => Promise<RelaySendResult | null>
  pull: (request: RelayPullRequest) => Promise<RelayMessage[]>
  ack: (deviceId: string, messageIds: string[]) => Promise<number>
}

const relaySendAttempts = 2
const relayRetryDelayMs = 800
const nostrKind = 4

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

const normalizeRelayList = (relays: string[]) =>
  Array.from(new Set(relays.map((entry) => entry.trim()).filter(Boolean)))

const resolveRelayBases = (origin: string, discovered: string[]) => {
  const configured = appConfig.p2pRelayBases ?? []
  const all = normalizeRelayList([...configured, ...discovered])
  const resolved = all.map((entry) => normalizeBase(entry, origin)).filter(Boolean)
  const apiFallback = buildApiUrl('', origin)
  const normalized = resolved.map((base) => {
    if (base === origin && apiFallback !== origin) return apiFallback
    return base
  })
  if (normalized.length) return normalized
  return [apiFallback]
}

const resolveNostrRelays = (discovered: string[]) => {
  const configured = appConfig.p2pNostrRelays ?? []
  return normalizeRelayList([...configured, ...discovered]).filter(
    (entry) => entry.startsWith('wss://') || entry.startsWith('ws://')
  )
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
      relayBase,
      relayKind: 'http'
    })
  }
  return messages
}

const parseAckResult = (payload: unknown) => {
  if (!isRecord(payload)) return 0
  const removed = payload.removed
  return typeof removed === 'number' ? removed : 0
}

const hexToBytes = (value: string) => {
  const clean = value.trim().toLowerCase()
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    const byte = Number.parseInt(clean.slice(i, i + 2), 16)
    if (!Number.isFinite(byte)) throw new Error('Invalid hex string')
    bytes[i / 2] = byte
  }
  return bytes
}

const nostrLastPullKey = (pubkey: string) => `chat:p2p:nostr:lastpull:${pubkey}`

const readNostrCursor = (pubkey: string) => {
  if (typeof window === 'undefined') return undefined
  const raw = window.localStorage.getItem(nostrLastPullKey(pubkey))
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const writeNostrCursor = (pubkey: string, createdAt: number) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(nostrLastPullKey(pubkey), String(createdAt))
  } catch {
    // ignore storage failures
  }
}

const pool = new SimplePool()

const createHttpRelayClients = (origin: string, discovered: string[]): RelayClient[] => {
  const bases = resolveRelayBases(origin, discovered)

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
      kind: 'http',
      send,
      pull,
      ack
    } satisfies RelayClient
  })
}

const createNostrRelayClient = (
  relays: string[],
  identity?: RelayIdentity,
  recipientRelayKey?: string
): RelayClient | null => {
  if (!relays.length || !identity) return null
  const baseUrl = 'nostr'
  const secretKeyBytes = hexToBytes(identity.secretKey)

  const send = async (request: RelaySendRequest) => {
    const targetRelayKey = request.recipientRelayKey ?? recipientRelayKey
    if (!targetRelayKey) return null
    const createdAt = Math.floor(Date.now() / 1000)
    const content = JSON.stringify({
      v: 1,
      messageId: request.messageId,
      sessionId: request.sessionId,
      senderId: request.senderId,
      recipientId: request.recipientId,
      senderDeviceId: request.senderDeviceId,
      createdAt: new Date().toISOString(),
      payload: request.payload
    })
    const event = finalizeEvent(
      {
        kind: nostrKind,
        created_at: createdAt,
        tags: [
          ['p', targetRelayKey],
          ['d', request.messageId],
          ['t', 'prometheus-p2p']
        ],
        content
      },
      secretKeyBytes
    )
    const results = await Promise.allSettled(pool.publish(relays, event))
    const delivered = results.filter((result) => result.status === 'fulfilled').length
    return { id: event.id, delivered }
  }

  const pull = async (request: RelayPullRequest) => {
    const relayKey = request.relayPublicKey
    if (!relayKey) return []
    const since = readNostrCursor(relayKey)
    const filters = {
      kinds: [nostrKind],
      '#p': [relayKey],
      '#t': ['prometheus-p2p'],
      ...(since ? { since } : {})
    }
    const events: Array<{ id: string; content: string; created_at: number }> = []
    let resolved = false

    await new Promise<void>((resolve) => {
      const subscription = pool.subscribeManyEose(relays, filters, {
        onevent(event) {
          if (!event || typeof event.id !== 'string' || typeof event.content !== 'string') return
          events.push({ id: event.id, content: event.content, created_at: event.created_at })
        },
        oneose() {
          if (resolved) return
          resolved = true
          subscription.close()
          resolve()
        },
        onclose() {
          if (resolved) return
          resolved = true
          resolve()
        }
      })
      window.setTimeout(() => {
        if (resolved) return
        resolved = true
        subscription.close()
        resolve()
      }, 1800)
    })

    const messages: RelayMessage[] = []
    let newest = since ?? 0
    for (const event of events) {
      try {
        const parsed = JSON.parse(event.content) as {
          v?: number
          messageId?: string
          sessionId?: string
          senderId?: string
          recipientId?: string
          senderDeviceId?: string
          createdAt?: string
          payload?: unknown
        }
        if (!parsed || parsed.v !== 1 || !parsed.payload) continue
        const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(event.created_at * 1000).toISOString()
        messages.push({
          id: event.id,
          from: typeof parsed.senderId === 'string' ? parsed.senderId : '',
          to: typeof parsed.recipientId === 'string' ? parsed.recipientId : '',
          deviceId: typeof parsed.senderDeviceId === 'string' ? parsed.senderDeviceId : '',
          sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
          payload: parsed.payload,
          createdAt,
          relayBase: baseUrl,
          relayKind: 'nostr'
        })
        if (event.created_at > newest) {
          newest = event.created_at
        }
      } catch {
        // ignore malformed event content
      }
    }
    if (newest) {
      writeNostrCursor(relayKey, newest)
    }
    return messages
  }

  const ack = async (_deviceId: string, messageIds: string[]) => {
    if (!messageIds.length) return 0
    const createdAt = Math.floor(Date.now() / 1000)
    const event = finalizeEvent(
      {
        kind: 5,
        created_at: createdAt,
        tags: messageIds.map((id) => ['e', id]),
        content: ''
      },
      secretKeyBytes
    )
    const results = await Promise.allSettled(pool.publish(relays, event))
    return results.filter((result) => result.status === 'fulfilled').length
  }

  return {
    baseUrl,
    kind: 'nostr',
    send,
    pull,
    ack
  }
}

export const createRelayClients = (
  origin: string,
  options?: {
    discoveredRelays?: string[]
    relayIdentity?: RelayIdentity
    recipientRelayKey?: string
  }
): RelayClient[] => {
  const discovered = options?.discoveredRelays ?? []
  const httpClients = createHttpRelayClients(origin, discovered)
  const nostrRelays = resolveNostrRelays(discovered)
  const nostrClient = createNostrRelayClient(nostrRelays, options?.relayIdentity, options?.recipientRelayKey)
  return [...httpClients, ...(nostrClient ? [nostrClient] : [])]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createRelayManager = (
  origin: string,
  options?: {
    discoveredRelays?: string[]
    relayIdentity?: RelayIdentity
    recipientRelayKey?: string
  }
): RelayManager => {
  const clients = createRelayClients(origin, options)

  const send = async (request: RelaySendRequest) => {
    if (!clients.length) return null
    let attempt = 0
    let delivered = 0
    while (attempt < relaySendAttempts) {
      attempt += 1
      const results = await Promise.allSettled(clients.map((client) => client.send(request)))
      delivered = results.reduce((sum, result) => {
        if (result.status !== 'fulfilled' || !result.value) return sum
        return sum + result.value.delivered
      }, 0)
      if (delivered > 0) {
        return { id: request.messageId, delivered }
      }
      if (attempt < relaySendAttempts) {
        await sleep(relayRetryDelayMs)
      }
    }
    return { id: request.messageId, delivered }
  }

  const pull = async (request: RelayPullRequest) => {
    if (!clients.length) return []
    const results = await Promise.all(clients.map((client) => client.pull(request)))
    return results.flat()
  }

  const ack = async (deviceId: string, messageIds: string[]) => {
    if (!clients.length || !messageIds.length) return 0
    const results = await Promise.all(clients.map((client) => client.ack(deviceId, messageIds)))
    return results.reduce((sum, count) => sum + count, 0)
  }

  return { clients, send, pull, ack }
}

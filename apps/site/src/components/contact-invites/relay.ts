import { SimplePool, finalizeEvent } from 'nostr-tools'
import type { LightNode } from '@waku/sdk'
import { appConfig } from '../../app-config'
import { buildApiUrl } from './api'
import { isRecord } from './utils'

type WakuSdk = typeof import('@waku/sdk')

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
  userId?: string
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
  relayKind?: 'http' | 'nostr' | 'waku'
}

export type RelayIdentity = {
  publicKey: string
  secretKey: string
}

export type RelayClient = {
  baseUrl: string
  kind: 'http' | 'nostr' | 'waku'
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
const wakuContentTopic = '/prometheus/1/chat/json'
const wakuCursorPrefix = 'chat:p2p:waku:cursor:'
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

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

const isLikelyHostname = (hostname: string) => {
  if (!hostname) return false
  if (hostname === 'localhost') return true
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true
  if (hostname.includes(':')) return true
  const parts = hostname.split('.').filter(Boolean)
  if (parts.length < 2) return false
  const tld = parts[parts.length - 1]
  if (!tld || tld.length < 2) return false
  return true
}

const isValidWebSocketUrl = (value: string) => {
  if (!value.startsWith('wss://') && !value.startsWith('ws://')) return false
  try {
    const url = new URL(value)
    return isLikelyHostname(url.hostname)
  } catch {
    return false
  }
}

const isHttpRelayEntry = (value: string) => {
  if (!value) return false
  if (value.startsWith('/')) return true
  return value.startsWith('https://') || value.startsWith('http://')
}

const normalizeRelayList = (relays: string[]) =>
  Array.from(new Set(relays.map((entry) => entry.trim()).filter(Boolean)))

const wakuPrefix = 'waku:'
const multiaddrPrefix = 'multiaddr:'

const normalizeWakuPeer = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith(wakuPrefix)) {
    return trimmed.slice(wakuPrefix.length).trim()
  }
  if (trimmed.startsWith(multiaddrPrefix)) {
    return trimmed.slice(multiaddrPrefix.length).trim()
  }
  return trimmed
}

const isWakuMultiaddr = (value: string) => {
  const normalized = normalizeWakuPeer(value)
  if (!normalized.startsWith('/')) return false
  return (
    normalized.startsWith('/dns') ||
    normalized.startsWith('/ip4') ||
    normalized.startsWith('/ip6') ||
    normalized.startsWith('/tcp') ||
    normalized.startsWith('/ws') ||
    normalized.startsWith('/wss') ||
    normalized.includes('/p2p/')
  )
}

const resolveRelayBases = (origin: string, discovered: string[]) => {
  const configured = appConfig.p2pRelayBases ?? []
  const all = normalizeRelayList([...configured, ...discovered]).filter((entry) => {
    if (isWakuMultiaddr(entry) || entry.startsWith(wakuPrefix) || entry.startsWith(multiaddrPrefix)) return false
    if (entry.startsWith('ws://') || entry.startsWith('wss://')) return false
    return isHttpRelayEntry(entry)
  })
  const resolved = all.map((entry) => normalizeBase(entry, origin)).filter(Boolean)
  return resolved.map((base) => {
    const apiFallback = buildApiUrl('', origin)
    if (base === origin && apiFallback !== origin) return apiFallback
    return base
  })
}

const resolveNostrRelays = (discovered: string[]) => {
  const configured = appConfig.p2pNostrRelays ?? []
  return normalizeRelayList([...configured, ...discovered]).filter(isValidWebSocketUrl)
}

const resolveWakuRelays = (discovered: string[]) => {
  const configured = appConfig.p2pWakuRelays ?? []
  const all = normalizeRelayList([...configured, ...discovered])
  const peers = all
    .map((entry) => normalizeWakuPeer(entry))
    .filter((entry) => isWakuMultiaddr(entry))
  return Array.from(new Set(peers))
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

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const base64ToBytes = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
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

const wakuCursorKey = (deviceId: string, relayKey?: string) =>
  `${wakuCursorPrefix}${relayKey ? `key:${relayKey}` : `device:${deviceId}`}`

const readWakuCursor = (deviceId: string, relayKey?: string) => {
  if (typeof window === 'undefined') return undefined
  const raw = window.localStorage.getItem(wakuCursorKey(deviceId, relayKey))
  if (!raw) return undefined
  try {
    return base64ToBytes(raw)
  } catch {
    return undefined
  }
}

const writeWakuCursor = (deviceId: string, cursor: Uint8Array, relayKey?: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(wakuCursorKey(deviceId, relayKey), bytesToBase64(cursor))
  } catch {
    // ignore storage failures
  }
}

const pool = new SimplePool()

let wakuSdkPromise: Promise<WakuSdk> | null = null
const wakuNodes = new Map<string, Promise<LightNode>>()

const loadWakuSdk = async () => {
  if (!wakuSdkPromise) {
    wakuSdkPromise = import('@waku/sdk')
  }
  return wakuSdkPromise
}

const buildWakuNodeKey = (peers: string[]) => {
  if (!peers.length) return 'default'
  return peers.slice().sort().join(',')
}

const getWakuNode = async (peers: string[]) => {
  const key = buildWakuNodeKey(peers)
  const existing = wakuNodes.get(key)
  if (existing) return existing
  const promise = (async () => {
    const sdk = await loadWakuSdk()
    const node = await sdk.createLightNode({
      defaultBootstrap: peers.length === 0,
      bootstrapPeers: peers.length ? peers : undefined
    })
    try {
      await sdk.waitForRemotePeer(node, [sdk.Protocols.Store, sdk.Protocols.LightPush], 4500)
    } catch {
      // ignore bootstrap timeouts
    }
    return node
  })()
  wakuNodes.set(key, promise)
  try {
    return await promise
  } catch (error) {
    wakuNodes.delete(key)
    throw error
  }
}

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
      const subscription = pool.subscribeManyEose(relays, [filters], {
        onevent(event) {
          if (!event || typeof event.id !== 'string' || typeof event.content !== 'string') return
          events.push({ id: event.id, content: event.content, created_at: event.created_at })
        },
        onclose() {
          if (resolved) return
          resolved = true
          resolve()
        },
        maxWait: 1800
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

type WakuEnvelope = {
  v?: number
  messageId?: string
  sessionId?: string
  senderId?: string
  recipientId?: string
  recipientDeviceId?: string
  recipientRelayKey?: string
  senderDeviceId?: string
  createdAt?: string
  payload?: unknown
}

const parseWakuEnvelope = (payload: Uint8Array) => {
  try {
    const text = textDecoder.decode(payload)
    const parsed = JSON.parse(text) as unknown
    if (!isRecord(parsed)) return null
    if (typeof parsed.v === 'number' && parsed.v !== 1) return null
    if (!('payload' in parsed)) return null
    return parsed as WakuEnvelope
  } catch {
    return null
  }
}

const createWakuRelayClient = (peers: string[]): RelayClient | null => {
  if (typeof window === 'undefined' || peers.length === 0) return null
  const baseUrl = 'waku'

  const send = async (request: RelaySendRequest) => {
    try {
      const node = await getWakuNode(peers)
      const lightPush = node.lightPush
      if (!lightPush) return null
      const encoder = node.createEncoder({ contentTopic: wakuContentTopic })
      const targets = request.deviceIds && request.deviceIds.length ? request.deviceIds : [undefined]
      const results = await Promise.allSettled(
        targets.map(async (recipientDeviceId) => {
          const envelope: WakuEnvelope = {
            v: 1,
            messageId: request.messageId,
            sessionId: request.sessionId,
            senderId: request.senderId,
            recipientId: request.recipientId,
            recipientRelayKey: request.recipientRelayKey,
            recipientDeviceId,
            senderDeviceId: request.senderDeviceId,
            createdAt: new Date().toISOString(),
            payload: request.payload
          }
          const message = {
            payload: textEncoder.encode(JSON.stringify(envelope)),
            timestamp: new Date()
          }
          return lightPush.send(encoder, message)
        })
      )
      const delivered = results.reduce((sum, result) => {
        if (result.status !== 'fulfilled') return sum
        const successes = result.value?.successes?.length ?? 0
        return sum + successes
      }, 0)
      return { id: request.messageId, delivered }
    } catch {
      return null
    }
  }

  const pull = async (request: RelayPullRequest) => {
    try {
      const node = await getWakuNode(peers)
      const store = node.store
      if (!store) return []
      const decoder = node.createDecoder({ contentTopic: wakuContentTopic })
      const cursor = readWakuCursor(request.deviceId, request.relayPublicKey)
      const messages: RelayMessage[] = []
      let lastCursor: Uint8Array | undefined
      await store.queryWithOrderedCallback([decoder], async (message) => {
        lastCursor = store.createCursor(message)
        const envelope = parseWakuEnvelope(message.payload)
        if (!envelope) return false
        if (request.relayPublicKey && envelope.recipientRelayKey && envelope.recipientRelayKey !== request.relayPublicKey) {
          return false
        }
        if (request.userId && envelope.recipientId && envelope.recipientId !== request.userId) {
          return false
        }
        if (request.deviceId && envelope.recipientDeviceId && envelope.recipientDeviceId !== request.deviceId) {
          return false
        }
        const from = typeof envelope.senderId === 'string' ? envelope.senderId : ''
        const to = typeof envelope.recipientId === 'string' ? envelope.recipientId : ''
        const deviceId = typeof envelope.senderDeviceId === 'string' ? envelope.senderDeviceId : ''
        if (!from || !to || !deviceId) return false
        const createdAt =
          typeof envelope.createdAt === 'string'
            ? envelope.createdAt
            : message.timestamp?.toISOString() ?? new Date().toISOString()
        messages.push({
          id: message.hashStr,
          from,
          to,
          deviceId,
          sessionId: typeof envelope.sessionId === 'string' ? envelope.sessionId : undefined,
          payload: envelope.payload,
          createdAt,
          relayBase: baseUrl,
          relayKind: 'waku'
        })
        if (request.limit && messages.length >= request.limit) {
          return true
        }
        return false
      }, {
        paginationCursor: cursor,
        paginationForward: true,
        paginationLimit: request.limit
      })
      if (lastCursor) {
        writeWakuCursor(request.deviceId, lastCursor, request.relayPublicKey)
      }
      return messages
    } catch {
      return []
    }
  }

  const ack = async (_deviceId: string, _messageIds: string[]) => 0

  return {
    baseUrl,
    kind: 'waku',
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
  const wakuRelays = resolveWakuRelays(discovered)
  const wakuClient = createWakuRelayClient(wakuRelays)
  return [...httpClients, ...(nostrClient ? [nostrClient] : []), ...(wakuClient ? [wakuClient] : [])]
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

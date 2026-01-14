import { SimplePool, finalizeEvent, type Filter } from 'nostr-tools'
import { appConfig } from '../../app-config'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import type { ContactDevice } from './types'
import { isRecord } from './utils'
import type { LocalPrekeyBundle, RemotePrekeyBundle } from './signal'

type DirectoryDevicePayload = {
  v: 1
  userId: string
  deviceId: string
  publicKey: JsonWebKey
  label?: string
  role?: 'device' | 'relay'
  relayPublicKey?: string
  relayUrls?: string[]
  updatedAt?: string
}

type DirectoryPrekeyPayload = {
  v: 1
  userId: string
  deviceId: string
  registrationId: number
  identityKey: string
  signedPreKey: {
    keyId: number
    publicKey: string
    signature: string
  }
  oneTimePreKeys?: Array<{
    keyId: number
    publicKey: string
  }>
  updatedAt?: string
}

const pool = new SimplePool()
const nostrDeviceKind = 30078
const nostrPrekeyKind = 30079
const directoryTag = 'prometheus-directory'
const deviceTag = 'prometheus-device'
const prekeyTag = 'prometheus-prekey'
const nostrTimeoutMs = 2200

const normalizeRelays = (relays: string[]) =>
  Array.from(
    new Set(
      relays
        .map((entry) => entry.trim())
        .filter((entry) => entry.startsWith('wss://') || entry.startsWith('ws://'))
    )
  )

const resolveNostrRelays = (discovered?: string[]) => {
  const configured = appConfig.p2pNostrRelays ?? []
  return normalizeRelays([...(configured ?? []), ...(discovered ?? [])])
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

const nostrCursorKey = (kind: 'devices' | 'prekeys', userId: string) => `chat:p2p:nostr:directory:${kind}:${userId}`

const readNostrCursor = (kind: 'devices' | 'prekeys', userId: string) => {
  if (typeof window === 'undefined') return undefined
  const raw = window.localStorage.getItem(nostrCursorKey(kind, userId))
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const writeNostrCursor = (kind: 'devices' | 'prekeys', userId: string, createdAt: number) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(nostrCursorKey(kind, userId), String(createdAt))
  } catch {
    // ignore storage failures
  }
}

const parseDevicePayload = (value: unknown): DirectoryDevicePayload | null => {
  if (!isRecord(value)) return null
  if (value.v !== 1) return null
  const userId = typeof value.userId === 'string' ? value.userId : ''
  const deviceId = typeof value.deviceId === 'string' ? value.deviceId : ''
  const publicKey = isRecord(value.publicKey) ? (value.publicKey as JsonWebKey) : null
  if (!userId || !deviceId || !publicKey) return null
  const relayUrls = Array.isArray(value.relayUrls)
    ? value.relayUrls.map((entry) => String(entry)).filter(Boolean)
    : undefined
  const role = value.role === 'relay' ? 'relay' : value.role === 'device' ? 'device' : undefined
  return {
    v: 1,
    userId,
    deviceId,
    publicKey,
    label: typeof value.label === 'string' ? value.label : undefined,
    role,
    relayPublicKey: typeof value.relayPublicKey === 'string' ? value.relayPublicKey : undefined,
    relayUrls,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined
  }
}

const parsePrekeyPayload = (value: unknown): RemotePrekeyBundle | null => {
  if (!isRecord(value)) return null
  if (value.v !== 1) return null
  const deviceId = typeof value.deviceId === 'string' ? value.deviceId : ''
  const registrationId = Number(value.registrationId)
  const identityKey = typeof value.identityKey === 'string' ? value.identityKey : ''
  if (!deviceId || !Number.isFinite(registrationId) || !identityKey) return null
  if (!isRecord(value.signedPreKey)) return null
  const signedPreKey = value.signedPreKey
  const keyId = Number(signedPreKey.keyId)
  const publicKey = typeof signedPreKey.publicKey === 'string' ? signedPreKey.publicKey : ''
  const signature = typeof signedPreKey.signature === 'string' ? signedPreKey.signature : ''
  if (!Number.isFinite(keyId) || !publicKey || !signature) return null
  let oneTimePreKey: RemotePrekeyBundle['oneTimePreKey']
  if (Array.isArray(value.oneTimePreKeys)) {
    const first = value.oneTimePreKeys[0]
    if (isRecord(first)) {
      const preKeyId = Number(first.keyId)
      const preKeyPublic = typeof first.publicKey === 'string' ? first.publicKey : ''
      if (Number.isFinite(preKeyId) && preKeyPublic) {
        oneTimePreKey = { keyId: preKeyId, publicKey: preKeyPublic }
      }
    }
  } else if (isRecord(value.oneTimePreKey)) {
    const preKeyId = Number(value.oneTimePreKey.keyId)
    const preKeyPublic = typeof value.oneTimePreKey.publicKey === 'string' ? value.oneTimePreKey.publicKey : ''
    if (Number.isFinite(preKeyId) && preKeyPublic) {
      oneTimePreKey = { keyId: preKeyId, publicKey: preKeyPublic }
    }
  }
  return {
    deviceId,
    registrationId,
    identityKey,
    signedPreKey: { keyId, publicKey, signature },
    oneTimePreKey
  }
}

const collectNostrEvents = async (relays: string[], filters: Filter[]) => {
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
    }, nostrTimeoutMs)
  })
  return events
}

export const publishRelayDevice = async (options: {
  identity: DeviceIdentity
  userId: string
  relayUrls?: string[]
  label?: string
}) => {
  if (typeof window === 'undefined') return false
  const { identity, userId } = options
  const relays = resolveNostrRelays(options.relayUrls)
  if (!relays.length || !identity.relaySecretKey || !identity.relayPublicKey) return false
  const now = new Date().toISOString()
  const payload: DirectoryDevicePayload = {
    v: 1,
    userId,
    deviceId: identity.deviceId,
    publicKey: identity.publicKeyJwk,
    label: options.label,
    role: identity.role,
    relayPublicKey: identity.relayPublicKey,
    relayUrls: options.relayUrls?.length ? options.relayUrls : undefined,
    updatedAt: now
  }
  const event = finalizeEvent(
    {
      kind: nostrDeviceKind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', directoryTag],
        ['t', deviceTag],
        ['u', userId],
        ['d', identity.deviceId]
      ],
      content: JSON.stringify(payload)
    },
    hexToBytes(identity.relaySecretKey)
  )
  const results = await Promise.allSettled(pool.publish(relays, event))
  return results.some((result) => result.status === 'fulfilled')
}

export const fetchRelayDevices = async (options: {
  userId: string
  relayUrls?: string[]
}): Promise<ContactDevice[]> => {
  if (typeof window === 'undefined') return []
  const userId = options.userId.trim()
  if (!userId) return []
  const relays = resolveNostrRelays(options.relayUrls)
  if (!relays.length) return []
  const since = readNostrCursor('devices', userId)
  const filters: Filter[] = [
    {
      kinds: [nostrDeviceKind],
      '#u': [userId],
      '#t': [directoryTag, deviceTag],
      ...(since ? { since } : {})
    }
  ]
  const events = await collectNostrEvents(relays, filters)
  let newest = since ?? 0
  const byDevice = new Map<string, { payload: DirectoryDevicePayload; createdAt: number }>()
  for (const event of events) {
    try {
      const parsed = JSON.parse(event.content) as unknown
      const payload = parseDevicePayload(parsed)
      if (!payload || payload.userId !== userId) continue
      const createdAt = event.created_at
      const existing = byDevice.get(payload.deviceId)
      if (!existing || createdAt > existing.createdAt) {
        byDevice.set(payload.deviceId, { payload, createdAt })
      }
      if (createdAt > newest) newest = createdAt
    } catch {
      // ignore malformed events
    }
  }
  if (newest) {
    writeNostrCursor('devices', userId, newest)
  }
  return Array.from(byDevice.values()).map(({ payload }) => ({
    deviceId: payload.deviceId,
    publicKey: payload.publicKey,
    label: payload.label,
    role: payload.role,
    relayPublicKey: payload.relayPublicKey,
    relayUrls: payload.relayUrls,
    updatedAt: payload.updatedAt
  }))
}

export const publishRelayPrekeys = async (options: {
  identity: DeviceIdentity
  userId: string
  bundle: LocalPrekeyBundle
  relayUrls?: string[]
}) => {
  if (typeof window === 'undefined') return false
  const relays = resolveNostrRelays(options.relayUrls)
  if (!relays.length || !options.identity.relaySecretKey) return false
  const now = new Date().toISOString()
  const payload: DirectoryPrekeyPayload = {
    v: 1,
    userId: options.userId,
    deviceId: options.identity.deviceId,
    registrationId: options.bundle.registrationId,
    identityKey: options.bundle.identityKey,
    signedPreKey: options.bundle.signedPreKey,
    oneTimePreKeys: options.bundle.oneTimePreKeys,
    updatedAt: now
  }
  const event = finalizeEvent(
    {
      kind: nostrPrekeyKind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', directoryTag],
        ['t', prekeyTag],
        ['u', options.userId],
        ['d', options.identity.deviceId]
      ],
      content: JSON.stringify(payload)
    },
    hexToBytes(options.identity.relaySecretKey)
  )
  const results = await Promise.allSettled(pool.publish(relays, event))
  return results.some((result) => result.status === 'fulfilled')
}

export const fetchRelayPrekeys = async (options: {
  userId: string
  relayUrls?: string[]
}): Promise<RemotePrekeyBundle[]> => {
  if (typeof window === 'undefined') return []
  const userId = options.userId.trim()
  if (!userId) return []
  const relays = resolveNostrRelays(options.relayUrls)
  if (!relays.length) return []
  const since = readNostrCursor('prekeys', userId)
  const filters: Filter[] = [
    {
      kinds: [nostrPrekeyKind],
      '#u': [userId],
      '#t': [directoryTag, prekeyTag],
      ...(since ? { since } : {})
    }
  ]
  const events = await collectNostrEvents(relays, filters)
  let newest = since ?? 0
  const byDevice = new Map<string, { bundle: RemotePrekeyBundle; createdAt: number }>()
  for (const event of events) {
    try {
      const parsed = JSON.parse(event.content) as unknown
      if (!isRecord(parsed) || parsed.userId !== userId) continue
      const bundle = parsePrekeyPayload(parsed)
      if (!bundle) continue
      const createdAt = event.created_at
      const existing = byDevice.get(bundle.deviceId)
      if (!existing || createdAt > existing.createdAt) {
        byDevice.set(bundle.deviceId, { bundle, createdAt })
      }
      if (createdAt > newest) newest = createdAt
    } catch {
      // ignore malformed events
    }
  }
  if (newest) {
    writeNostrCursor('prekeys', userId, newest)
  }
  return Array.from(byDevice.values()).map((entry) => entry.bundle)
}

export const buildRelayDirectoryLabels = (identity: DeviceIdentity) => {
  const parts = [identity.role === 'relay' ? 'relay' : 'device']
  if (typeof navigator !== 'undefined') {
    const agent = navigator.userAgent.trim()
    if (agent) parts.push(agent.slice(0, 64))
  }
  return parts.join(':')
}

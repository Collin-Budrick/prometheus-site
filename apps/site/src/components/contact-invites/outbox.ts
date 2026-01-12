import { decodeBase64, type DeviceIdentity } from '../../shared/p2p-crypto'
import { isRecord } from './utils'

export type OutboxItem = {
  id: string
  kind: 'text' | 'image'
  createdAt: string
  text?: string
  payloadBase64?: string
  encoding?: 'zstd'
  name?: string
  mime?: string
  size?: number
  width?: number
  height?: number
  sentAt?: string
  attempts?: number
  sentVia?: 'channel' | 'relay'
}

type StoredOutboxEnvelope = {
  v: 1
  iv: string
  ciphertext: string
}

type StoredOutboxPayload = {
  items: OutboxItem[]
  updatedAt?: string
}

const outboxStoragePrefix = 'chat:p2p:outbox:'

const buildOutboxKey = (contactId: string) => `${outboxStoragePrefix}${contactId}`

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const parseOutboxEnvelope = (raw: string): StoredOutboxEnvelope | null => {
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (parsed.v !== 1) return null
    if (typeof parsed.iv !== 'string' || typeof parsed.ciphertext !== 'string') return null
    return { v: 1, iv: parsed.iv, ciphertext: parsed.ciphertext }
  } catch {
    return null
  }
}

const deriveOutboxKey = async (identity: DeviceIdentity) => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  const jwk = await crypto.subtle.exportKey('jwk', identity.privateKey)
  const seed = typeof jwk.d === 'string' ? jwk.d : JSON.stringify(jwk)
  const material = new TextEncoder().encode(`p2p-outbox:${seed}`)
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

const encryptOutboxEnvelope = async (key: CryptoKey, payload: StoredOutboxPayload) => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return {
    v: 1,
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext))
  } satisfies StoredOutboxEnvelope
}

const decryptOutboxEnvelope = async (key: CryptoKey, envelope: StoredOutboxEnvelope) => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  const iv = decodeBase64(envelope.iv)
  const ciphertext = decodeBase64(envelope.ciphertext)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const decoded = new TextDecoder().decode(plaintext)
  try {
    return JSON.parse(decoded) as StoredOutboxPayload
  } catch {
    return null
  }
}

const normalizeItem = (item: OutboxItem) => {
  const id = typeof item.id === 'string' ? item.id : ''
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : ''
  const kind = item.kind === 'image' ? 'image' : 'text'
  if (!id || !createdAt) return null
  if (kind === 'text') {
    const text = typeof item.text === 'string' ? item.text : ''
    if (!text.trim()) return null
    const sentAt = typeof item.sentAt === 'string' ? item.sentAt : undefined
    const attempts = typeof item.attempts === 'number' ? item.attempts : undefined
    const sentVia = item.sentVia === 'relay' ? 'relay' : item.sentVia === 'channel' ? 'channel' : undefined
    return { id, kind, createdAt, text, sentAt, attempts, sentVia } satisfies OutboxItem
  }
  const payloadBase64 = typeof item.payloadBase64 === 'string' ? item.payloadBase64 : ''
  if (!payloadBase64) return null
  const sentAt = typeof item.sentAt === 'string' ? item.sentAt : undefined
  const attempts = typeof item.attempts === 'number' ? item.attempts : undefined
  const sentVia = item.sentVia === 'relay' ? 'relay' : item.sentVia === 'channel' ? 'channel' : undefined
  return {
    id,
    kind,
    createdAt,
    payloadBase64,
    encoding: item.encoding === 'zstd' ? 'zstd' : undefined,
    name: typeof item.name === 'string' ? item.name : undefined,
    mime: typeof item.mime === 'string' ? item.mime : undefined,
    size: typeof item.size === 'number' ? item.size : undefined,
    width: typeof item.width === 'number' ? item.width : undefined,
    height: typeof item.height === 'number' ? item.height : undefined,
    sentAt,
    attempts,
    sentVia
  } satisfies OutboxItem
}

const normalizeItems = (items: OutboxItem[]) => {
  const normalized: OutboxItem[] = []
  for (const item of items) {
    const next = normalizeItem(item)
    if (next) normalized.push(next)
  }
  return normalized
}

export const loadOutbox = async (contactId: string, identity: DeviceIdentity) => {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(buildOutboxKey(contactId))
  if (!raw) return []
  const envelope = parseOutboxEnvelope(raw)
  if (!envelope) return []
  const key = await deriveOutboxKey(identity)
  if (!key) return []
  const payload = await decryptOutboxEnvelope(key, envelope)
  if (!payload || !Array.isArray(payload.items)) return []
  return normalizeItems(payload.items)
}

export const saveOutbox = async (contactId: string, identity: DeviceIdentity, items: OutboxItem[]) => {
  if (typeof window === 'undefined') return false
  const normalized = normalizeItems(items)
  if (!normalized.length) {
    window.localStorage.removeItem(buildOutboxKey(contactId))
    return true
  }
  const key = await deriveOutboxKey(identity)
  if (!key) return false
  const envelope = await encryptOutboxEnvelope(key, { items: normalized, updatedAt: new Date().toISOString() })
  if (!envelope) return false
  try {
    window.localStorage.setItem(buildOutboxKey(contactId), JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

export const enqueueOutboxItem = async (contactId: string, identity: DeviceIdentity, item: OutboxItem) => {
  const existing = await loadOutbox(contactId, identity)
  const previous = existing.find((entry) => entry.id === item.id)
  const merged = previous ? { ...previous, ...item } : item
  const next = [...existing.filter((entry) => entry.id !== item.id), merged]
  return saveOutbox(contactId, identity, next)
}

export const markOutboxItemSent = async (
  contactId: string,
  identity: DeviceIdentity,
  itemId: string,
  sentVia: 'channel' | 'relay'
) => {
  const existing = await loadOutbox(contactId, identity)
  let updated = false
  const now = new Date().toISOString()
  const next = existing.map((item) => {
    if (item.id !== itemId) return item
    updated = true
    return {
      ...item,
      sentAt: now,
      attempts: (item.attempts ?? 0) + 1,
      sentVia
    }
  })
  if (!updated) return false
  return saveOutbox(contactId, identity, next)
}

export const removeOutboxItems = async (contactId: string, identity: DeviceIdentity, itemIds: string[]) => {
  if (!itemIds.length) return true
  const existing = await loadOutbox(contactId, identity)
  const filter = new Set(itemIds)
  const next = existing.filter((item) => !filter.has(item.id))
  return saveOutbox(contactId, identity, next)
}

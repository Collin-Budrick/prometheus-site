import { decodeBase64, type DeviceIdentity } from '../../shared/p2p-crypto'
import type { DmMessage } from './types'
import { isRecord } from './utils'

const historyStoragePrefix = 'chat:p2p:history:'

export const historyCacheLimit = 200
export const historyRequestLimit = 120

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

type StoredHistoryEnvelope = {
  v: 1
  iv: string
  ciphertext: string
}

type StoredHistoryPayload = {
  messages: DmMessage[]
  updatedAt?: string
}

const buildHistoryStorageKey = (contactId: string) => `${historyStoragePrefix}${contactId}`

const parseHistoryEnvelope = (raw: string): StoredHistoryEnvelope | null => {
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

const deriveHistoryKey = async (identity: DeviceIdentity) => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  const jwk = await crypto.subtle.exportKey('jwk', identity.privateKey)
  const seed = typeof jwk.d === 'string' ? jwk.d : JSON.stringify(jwk)
  const material = new TextEncoder().encode(`p2p-history:${seed}`)
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

const encryptHistoryEnvelope = async (key: CryptoKey, payload: StoredHistoryPayload) => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return {
    v: 1,
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext))
  } satisfies StoredHistoryEnvelope
}

const decryptHistoryEnvelope = async (key: CryptoKey, envelope: StoredHistoryEnvelope) => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  const iv = decodeBase64(envelope.iv)
  const ciphertext = decodeBase64(envelope.ciphertext)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const decoded = new TextDecoder().decode(plaintext)
  try {
    return JSON.parse(decoded) as StoredHistoryPayload
  } catch {
    return null
  }
}

const messageTimestamp = (value: string) => {
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

const statusRank = (status?: DmMessage['status']) => {
  if (status === 'sent') return 4
  if (status === 'queued') return 3
  if (status === 'pending') return 2
  if (status === 'failed') return 1
  return 0
}

const mergeMessageStatus = (current?: DmMessage['status'], next?: DmMessage['status']) =>
  statusRank(next) > statusRank(current) ? next : current

const normalizeHistoryMessages = (messages: DmMessage[]) =>
  messages
    .filter((message) => message && typeof message.id === 'string')
    .map((message) => ({
      id: message.id,
      text: message.text,
      author: message.author,
      createdAt: message.createdAt,
      status: message.status
    }))
    .filter(
      (message) =>
        typeof message.text === 'string' &&
        typeof message.createdAt === 'string' &&
        (message.author === 'self' || message.author === 'contact')
    )

export const mergeHistoryMessages = (existing: DmMessage[], incoming: DmMessage[]) => {
  const merged = new Map<string, DmMessage>()
  const upsert = (message: DmMessage) => {
    const current = merged.get(message.id)
    if (!current) {
      merged.set(message.id, message)
      return
    }
    merged.set(message.id, {
      id: current.id,
      text: message.text || current.text,
      author: current.author ?? message.author,
      createdAt: current.createdAt || message.createdAt,
      status: mergeMessageStatus(current.status, message.status)
    })
  }
  existing.forEach(upsert)
  incoming.forEach(upsert)
  return Array.from(merged.values()).sort((a, b) => {
    const delta = messageTimestamp(a.createdAt) - messageTimestamp(b.createdAt)
    if (delta !== 0) return delta
    return a.id.localeCompare(b.id)
  })
}

export const loadHistory = async (contactId: string, identity: DeviceIdentity) => {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(buildHistoryStorageKey(contactId))
  if (!raw) return []
  const envelope = parseHistoryEnvelope(raw)
  if (!envelope) return []
  const key = await deriveHistoryKey(identity)
  if (!key) return []
  try {
    const payload = await decryptHistoryEnvelope(key, envelope)
    if (!payload || !Array.isArray(payload.messages)) return []
    return normalizeHistoryMessages(payload.messages)
  } catch {
    return []
  }
}

export const persistHistory = async (contactId: string, identity: DeviceIdentity, messages: DmMessage[]) => {
  if (typeof window === 'undefined') return
  const key = await deriveHistoryKey(identity)
  if (!key) return
  const trimmed = normalizeHistoryMessages(messages).slice(-historyCacheLimit)
  const envelope = await encryptHistoryEnvelope(key, {
    messages: trimmed,
    updatedAt: new Date().toISOString()
  })
  if (!envelope) return
  try {
    window.localStorage.setItem(buildHistoryStorageKey(contactId), JSON.stringify(envelope))
  } catch {
    // ignore storage failures
  }
}

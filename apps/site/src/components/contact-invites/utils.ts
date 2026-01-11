import type { EncryptedPayload } from '../../shared/p2p-crypto'
import type { ContactDevice } from './types'

export const normalizeLabel = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

export const normalizeQuery = (value: string) => value.trim().toLowerCase()

export const matchesQuery = (entry: { name?: string | null; email: string }, query: string) => {
  if (!query) return false
  const emailMatch = entry.email.toLowerCase().includes(query)
  const nameMatch = entry.name?.toLowerCase().includes(query) ?? false
  return emailMatch || nameMatch
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const resolveEncryptedPayload = (payload: unknown): EncryptedPayload | null => {
  if (!isRecord(payload)) return null
  if (payload.version !== 1) return null
  if (typeof payload.sessionId !== 'string') return null
  if (typeof payload.salt !== 'string') return null
  if (typeof payload.iv !== 'string') return null
  if (typeof payload.ciphertext !== 'string') return null
  const senderDeviceId = typeof payload.senderDeviceId === 'string' ? payload.senderDeviceId : undefined
  return {
    version: 1,
    sessionId: payload.sessionId,
    salt: payload.salt,
    iv: payload.iv,
    ciphertext: payload.ciphertext,
    senderDeviceId
  }
}

export const pickPreferredDevice = (devices: ContactDevice[]) =>
  devices.find((device) => device.role !== 'relay') ?? devices[0] ?? null

export const createMessageId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const formatMessageTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const formatDisplayName = (entry: { name?: string | null; email: string }) => {
  const trimmed = entry.name?.trim() ?? ''
  return trimmed === '' ? entry.email : trimmed
}

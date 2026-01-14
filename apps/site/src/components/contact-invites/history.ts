import type { DeviceIdentity } from '../../shared/p2p-crypto'
import type { DmMessage } from './types'
import { isRecord } from './utils'
import { loadContactMaps } from './crdt-store'

export const historyCacheLimit = 200
export const historyRequestLimit = 120

const messageTimestamp = (value: string) => {
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

const statusRank = (status?: DmMessage['status']) => {
  if (status === 'read') return 5
  if (status === 'sent') return 4
  if (status === 'queued') return 3
  if (status === 'pending') return 2
  if (status === 'failed') return 1
  return 0
}

const statusFromRank = (rank: number) => {
  if (rank >= 5) return 'read'
  if (rank >= 4) return 'sent'
  if (rank >= 3) return 'queued'
  if (rank >= 2) return 'pending'
  if (rank >= 1) return 'failed'
  return undefined
}

const normalizeImage = (value: unknown) => {
  if (!isRecord(value)) return undefined
  const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl : ''
  if (!dataUrl) return undefined
  const name = typeof value.name === 'string' ? value.name : undefined
  const mime = typeof value.mime === 'string' ? value.mime : undefined
  const width = typeof value.width === 'number' ? value.width : undefined
  const height = typeof value.height === 'number' ? value.height : undefined
  const size = typeof value.size === 'number' ? value.size : undefined
  return { dataUrl, name, mime, width, height, size }
}

const normalizeHistoryMessages = (messages: DmMessage[]) =>
  messages
    .filter((message) => message && typeof message.id === 'string')
    .map((message) => ({
      id: message.id,
      text: typeof message.text === 'string' ? message.text : '',
      author: message.author,
      createdAt: message.createdAt,
      status: message.status,
      kind: message.kind,
      image: normalizeImage(message.image)
    }))
    .filter(
      (message) =>
        typeof message.createdAt === 'string' &&
        (message.author === 'self' || message.author === 'contact') &&
        (message.text.trim().length > 0 || Boolean(message.image))
    )

const mergeMessageStatus = (current?: DmMessage['status'], next?: DmMessage['status']) =>
  statusRank(next) > statusRank(current) ? next : current

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
      status: mergeMessageStatus(current.status, message.status),
      kind: message.kind ?? current.kind,
      image: message.image ?? current.image
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

const parseArchiveStamp = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const resolveStoredMessage = (value: unknown): DmMessage | null => {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const author = value.author === 'self' || value.author === 'contact' ? value.author : null
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : ''
  const text = typeof value.text === 'string' ? value.text : ''
  if (!id || !author || !createdAt) return null
  const rankValue = typeof value.statusRank === 'number' ? value.statusRank : statusRank(value.status as DmMessage['status'])
  const status = statusFromRank(rankValue)
  const image = normalizeImage(value.image)
  const kind = value.kind === 'image' || image ? 'image' : 'text'
  return {
    id,
    text,
    author,
    createdAt,
    status,
    kind,
    image
  }
}

const chooseCreatedAt = (current?: string, incoming?: string) => {
  if (!current) return incoming ?? ''
  if (!incoming) return current
  return messageTimestamp(current) <= messageTimestamp(incoming) ? current : incoming
}

const mergeStoredMessage = (current: unknown, incoming: DmMessage) => {
  const currentRecord = isRecord(current) ? current : null
  const currentRank = currentRecord
    ? typeof currentRecord.statusRank === 'number'
      ? currentRecord.statusRank
      : statusRank(currentRecord.status as DmMessage['status'])
    : 0
  const incomingRank = statusRank(incoming.status)
  const nextRank = Math.max(currentRank, incomingRank)
  const status = statusFromRank(nextRank)
  const createdAt = chooseCreatedAt(
    currentRecord && typeof currentRecord.createdAt === 'string' ? currentRecord.createdAt : undefined,
    incoming.createdAt
  )
  const text = incoming.text || (currentRecord && typeof currentRecord.text === 'string' ? currentRecord.text : '')
  const author =
    currentRecord && (currentRecord.author === 'self' || currentRecord.author === 'contact')
      ? currentRecord.author
      : incoming.author
  const image = incoming.image ?? normalizeImage(currentRecord?.image)
  const kind = incoming.kind ?? (image ? 'image' : 'text')
  return {
    id: incoming.id,
    text,
    author,
    createdAt,
    status,
    statusRank: nextRank,
    kind,
    image
  }
}

const trimMessages = (
  messages: { size: number; forEach: (fn: (value: unknown, key: string) => void) => void },
  limit: number
) => {
  if (messages.size <= limit) return []
  const entries: Array<{ id: string; createdAt: string }> = []
  messages.forEach((value, key) => {
    const createdAt = isRecord(value) && typeof value.createdAt === 'string' ? value.createdAt : ''
    entries.push({ id: key, createdAt })
  })
  entries.sort((a, b) => messageTimestamp(a.createdAt) - messageTimestamp(b.createdAt))
  const toRemove = entries.slice(0, Math.max(0, entries.length - limit))
  return toRemove.map((entry) => entry.id)
}

export const loadHistoryArchiveStamp = async (contactId: string, identity: DeviceIdentity) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return null
  return parseArchiveStamp(maps.meta.get('archiveStamp'))
}

export const archiveHistory = async (contactId: string, identity: DeviceIdentity) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return
  const stamp = new Date().toISOString()
  maps.doc.transact(() => {
    maps.meta.set('archiveStamp', stamp)
    maps.messages.clear()
  })
}

export const loadHistory = async (contactId: string, identity: DeviceIdentity) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return []
  const archiveStamp = parseArchiveStamp(maps.meta.get('archiveStamp'))
  const collected: DmMessage[] = []
  maps.messages.forEach((value) => {
    const parsed = resolveStoredMessage(value)
    if (parsed) collected.push(parsed)
  })
  const normalized = normalizeHistoryMessages(collected)
  if (!archiveStamp) return normalized
  return normalized.filter((message) => messageTimestamp(message.createdAt) > archiveStamp)
}

export const persistHistory = async (contactId: string, identity: DeviceIdentity, messages: DmMessage[]) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return
  const normalized = normalizeHistoryMessages(messages)
  maps.doc.transact(() => {
    normalized.forEach((message) => {
      const current = maps.messages.get(message.id)
      maps.messages.set(message.id, mergeStoredMessage(current, message))
    })
    const toRemove = trimMessages(maps.messages, historyCacheLimit)
    toRemove.forEach((id) => maps.messages.delete(id))
    maps.meta.set('updatedAt', new Date().toISOString())
  })
}

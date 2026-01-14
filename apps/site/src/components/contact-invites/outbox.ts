import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { isRecord } from './utils'
import { loadContactMaps } from './crdt-store'

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
  lastAttemptAt?: string
  nextAttemptAt?: string
  backoffMs?: number
}

const requestOutboxSync = async () => {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    if ('sync' in registration) {
      await registration.sync.register('p2p-outbox')
    }
  } catch {
    // ignore sync failures
  }
}

const normalizeItem = (item: OutboxItem) => {
  const id = typeof item.id === 'string' ? item.id : ''
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : ''
  const kind = item.kind === 'image' ? 'image' : 'text'
  if (!id || !createdAt) return null
  const attempts =
    typeof item.attempts === 'number' && Number.isFinite(item.attempts) && item.attempts >= 0
      ? item.attempts
      : undefined
  const sentAt = typeof item.sentAt === 'string' ? item.sentAt : undefined
  const sentVia = item.sentVia === 'relay' ? 'relay' : item.sentVia === 'channel' ? 'channel' : undefined
  const lastAttemptAt = typeof item.lastAttemptAt === 'string' ? item.lastAttemptAt : undefined
  const nextAttemptAt = typeof item.nextAttemptAt === 'string' ? item.nextAttemptAt : undefined
  const backoffMs =
    typeof item.backoffMs === 'number' && Number.isFinite(item.backoffMs) && item.backoffMs >= 0
      ? item.backoffMs
      : undefined
  if (kind === 'text') {
    const text = typeof item.text === 'string' ? item.text : ''
    if (!text.trim()) return null
    return {
      id,
      kind,
      createdAt,
      text,
      sentAt,
      attempts,
      sentVia,
      lastAttemptAt,
      nextAttemptAt,
      backoffMs
    } satisfies OutboxItem
  }
  const payloadBase64 = typeof item.payloadBase64 === 'string' ? item.payloadBase64 : ''
  if (!payloadBase64) return null
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
    sentVia,
    lastAttemptAt,
    nextAttemptAt,
    backoffMs
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

const areTextBodiesEqual = (left: OutboxItem, right: OutboxItem) => left.text === right.text

const areImageBodiesEqual = (left: OutboxItem, right: OutboxItem) =>
  left.payloadBase64 === right.payloadBase64 &&
  left.encoding === right.encoding &&
  left.name === right.name &&
  left.mime === right.mime &&
  left.size === right.size &&
  left.width === right.width &&
  left.height === right.height

const shouldClearSendState = (previous: OutboxItem, incoming: OutboxItem) => {
  const payloadChanged =
    previous.kind !== incoming.kind ||
    previous.createdAt !== incoming.createdAt ||
    (incoming.kind === 'text' && !areTextBodiesEqual(previous, incoming)) ||
    (incoming.kind === 'image' && !areImageBodiesEqual(previous, incoming))
  if (payloadChanged) return true
  const incomingSentState =
    incoming.sentAt ||
    incoming.sentVia ||
    incoming.lastAttemptAt ||
    incoming.nextAttemptAt ||
    typeof incoming.backoffMs === 'number'
  const previousSentState =
    previous.sentAt ||
    previous.sentVia ||
    previous.lastAttemptAt ||
    previous.nextAttemptAt ||
    typeof previous.backoffMs === 'number'
  return previousSentState && !incomingSentState
}

const mergeOutboxItem = (previous: OutboxItem, incoming: OutboxItem) => {
  const merged: OutboxItem = { ...previous, ...incoming }
  if (!shouldClearSendState(previous, incoming)) return merged
  return {
    ...merged,
    sentAt: undefined,
    sentVia: undefined,
    lastAttemptAt: undefined,
    nextAttemptAt: undefined,
    backoffMs: undefined
  }
}

export const loadOutbox = async (contactId: string, identity: DeviceIdentity) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return []
  const items: OutboxItem[] = []
  maps.outbox.forEach((value) => {
    if (isRecord(value)) {
      items.push(value as OutboxItem)
    }
  })
  return normalizeItems(items)
}

export const saveOutbox = async (contactId: string, identity: DeviceIdentity, items: OutboxItem[]) => {
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return false
  const normalized = normalizeItems(items)
  maps.doc.transact(() => {
    const nextIds = new Set(normalized.map((item) => item.id))
    maps.outbox.forEach((_value, key) => {
      if (!nextIds.has(String(key))) {
        maps.outbox.delete(String(key))
      }
    })
    normalized.forEach((item) => {
      maps.outbox.set(item.id, item)
    })
  })
  if (normalized.length) {
    void requestOutboxSync()
  }
  return true
}

export const enqueueOutboxItem = async (contactId: string, identity: DeviceIdentity, item: OutboxItem) => {
  const existing = await loadOutbox(contactId, identity)
  const previous = existing.find((entry) => entry.id === item.id)
  const merged = previous ? mergeOutboxItem(previous, item) : item
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
      sentVia,
      lastAttemptAt: now,
      nextAttemptAt: undefined,
      backoffMs: undefined
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

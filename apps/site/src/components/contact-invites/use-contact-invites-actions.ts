import { $, noSerialize, useVisibleTask$, type NoSerialize, type Signal } from '@builder.io/qwik'
import { saveChatSettings, type ChatSettings } from '../../shared/chat-settings'
import {
  ensureStoredIdentity,
  importStoredIdentity,
  loadStoredIdentity,
  saveStoredIdentity,
  type DeviceIdentity
} from '../../shared/p2p-crypto'
import { dmCloseDelayMs, dmMinScale, dmOriginRadius } from './constants'
import { archiveHistory } from './history'
import { registerPushSubscription } from './push'
import {
  publishRelayDevice,
  buildRelayDirectoryLabels,
  fetchRelayDevices
} from './relay-directory'
import { createRelayManager } from './relay'
import { publishSignalPrekeys } from './signal'
import { resolveRelayUrls, resolveWakuRelays } from './relay-mode'
import {
  applyContactEntry,
  loadContactsMaps,
  observeContacts,
  readContactEntry,
  serializeContactsPayload
} from './contacts-crdt'
import { buildContactInviteEvent, eventToContactEntry, parseContactInviteEvent } from './contacts-relay'
import {
  defaultPresenceTtlMs,
  loadContactsStore,
  resolveOnlineContactIds,
  syncContactsStoreFromInvitesPayload,
  updateContactPresence
} from './contacts-store'
import { createLocalChatTransport } from './local-transport'
import { resolveChatSettingsUserId } from './api'
import { decodeInviteToken } from './invite-token'
import { ensureFriendCode } from './friend-code'
import { createMessageId, isRecord } from './utils'
import type {
  ActiveContact,
  BaselineInviteCounts,
  ContactInviteView,
  ContactInvitesPayload,
  ContactSearchItem,
  ContactSearchResult,
  DmMessage,
  DmOrigin,
  RealtimeState
} from './types'

type ContactInvitesActionsOptions = {
  fragmentCopy: Signal<Record<string, string>>
  invitesState: Signal<'idle' | 'loading' | 'error'>
  statusMessage: Signal<string | null>
  statusTone: Signal<'neutral' | 'success' | 'error'>
  searchQuery: Signal<string>
  searchResults: Signal<ContactSearchResult[]>
  searchState: Signal<'idle' | 'loading' | 'error'>
  searchError: Signal<string | null>
  incoming: Signal<ContactInviteView[]>
  outgoing: Signal<ContactInviteView[]>
  contacts: Signal<ContactInviteView[]>
  onlineIds: Signal<string[]>
  baselineCounts: Signal<BaselineInviteCounts | null>
  activeContact: Signal<ActiveContact | null>
  dmClosing: Signal<boolean>
  dmOrigin: Signal<DmOrigin | null>
  dmAnimated: Signal<boolean>
  dmMessages: Signal<DmMessage[]>
  dmError: Signal<string | null>
  historySuppressed: Signal<boolean>
  busyKeys: Signal<string[]>
  realtimeState: Signal<RealtimeState>
  bellOpen: Signal<boolean>
  chatSettings: Signal<ChatSettings>
  chatSettingsUserId: Signal<string | undefined>
  chatSettingsOpen: Signal<boolean>
  chatSettingsButtonRef: Signal<HTMLButtonElement | undefined>
  chatSettingsPopoverRef: Signal<HTMLDivElement | undefined>
  identityRef: Signal<NoSerialize<DeviceIdentity> | undefined>
  remoteTyping: Signal<boolean>
  remoteTypingTimer: Signal<number | null>
  offline: Signal<boolean>
}

type QueuedContactAction =
  | {
      id: string
      type: 'invite'
      inviteId: string
      email: string
      userId?: string
      createdAt: string
    }
  | {
      id: string
      type: 'accept' | 'decline'
      inviteId: string
      userId: string
      createdAt: string
    }
  | {
      id: string
      type: 'remove'
      inviteId: string
      userId: string
      email: string
      createdAt: string
    }

type ContactsMaps = Awaited<ReturnType<typeof loadContactsMaps>>

const queueStorageKey = (userId?: string) =>
  `contact-invite-queue:${userId ? encodeURIComponent(userId) : 'anonymous'}`
const inviteQueueSyncTag = 'contact-invites-queue'

const loadQueuedActions = (storageKey: string) => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as QueuedContactAction[]) : []
  } catch {
    return []
  }
}

const saveQueuedActions = (storageKey: string, queue: QueuedContactAction[]) => {
  if (typeof window === 'undefined') return
  try {
    if (!queue.length) {
      window.localStorage.removeItem(storageKey)
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(queue))
  } catch {
    // ignore storage errors
  }
}

const dedupeQueuedActions = (queue: QueuedContactAction[]) => {
  const seen = new Set<string>()
  return queue.filter((action) => {
    const target = action.userId ?? ('email' in action ? action.email : '')
    const key = `${action.type}:${action.inviteId}:${target}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const enqueueQueuedAction = (storageKey: string, action: QueuedContactAction) => {
  const queue = loadQueuedActions(storageKey)
  const next = dedupeQueuedActions([...queue, action])
  saveQueuedActions(storageKey, next)
}

const migrateQueuedActions = (fromKey: string, toKey: string) => {
  if (fromKey === toKey) return
  const queued = loadQueuedActions(fromKey)
  if (!queued.length) return
  const merged = dedupeQueuedActions([...loadQueuedActions(toKey), ...queued])
  saveQueuedActions(toKey, merged)
  saveQueuedActions(fromKey, [])
}

const requestStoragePersistence = async () => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return
  try {
    const persisted = await navigator.storage.persisted()
    if (!persisted) {
      await navigator.storage.persist()
    }
  } catch {
    // ignore persistence failures
  }
}

const requestInviteQueueSync = async (reason: string) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    if ('sync' in registration) {
      await registration.sync.register(inviteQueueSyncTag)
      return
    }
  } catch {
    // ignore sync failures
  }
  navigator.serviceWorker.controller?.postMessage({ type: 'contact-invites:flush-queue', reason })
}

const resolveFragmentCopy = (copy: Record<string, string> | undefined, value: string) => copy?.[value] ?? value

const isNetworkOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const restorePopoverFocus = (
  popover: HTMLDivElement | undefined,
  button: HTMLButtonElement | undefined
) => {
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (!popover || !active || !popover.contains(active)) return
  button?.focus()
}

const resolveSelfUser = (userId?: string) => {
  if (!userId) return null
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('auth:bootstrap:user')
      if (raw) {
        const parsed = JSON.parse(raw) as { id?: string; email?: string; name?: string | null }
        if (parsed?.id === userId) {
          const email = parsed.email?.trim() ? parsed.email : userId
          return { id: parsed.id, email, name: parsed.name }
        }
      }
    } catch {
      // ignore storage failures
    }
  }
  return { id: userId, email: userId }
}

const resolveRelayIdentity = (identity?: DeviceIdentity) => {
  if (!identity?.relayPublicKey || !identity.relaySecretKey) return undefined
  return { publicKey: identity.relayPublicKey, secretKey: identity.relaySecretKey }
}

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const looksLikeUserId = (value: string) => userIdPattern.test(value)

type ContactPresenceRelayEvent = {
  kind: 'contact-presence'
  fromUserId: string
  toUserId: string
  updatedAt: string
  status: 'online'
  deviceId?: string
}

const presenceBroadcastIntervalMs = 20_000
const presenceRefreshIntervalMs = 5_000

const parseContactPresenceEvent = (payload: unknown): ContactPresenceRelayEvent | null => {
  if (!isRecord(payload)) return null
  if (payload.kind !== 'contact-presence') return null
  const fromUserId = typeof payload.fromUserId === 'string' ? payload.fromUserId : ''
  const toUserId = typeof payload.toUserId === 'string' ? payload.toUserId : ''
  const updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : ''
  const status = payload.status === 'online' ? 'online' : null
  if (!fromUserId || !toUserId || !updatedAt || !status) return null
  const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId : undefined
  return {
    kind: 'contact-presence',
    fromUserId,
    toUserId,
    updatedAt,
    status,
    deviceId
  }
}

const buildContactPresenceEvent = (options: { fromUserId: string; toUserId: string; deviceId?: string }) => ({
  kind: 'contact-presence' as const,
  fromUserId: options.fromUserId,
  toUserId: options.toUserId,
  updatedAt: new Date().toISOString(),
  status: 'online' as const,
  deviceId: options.deviceId
})

export const useContactInvitesActions = (options: ContactInvitesActionsOptions) => {
  const flushInFlight = { value: false }
  const contactsMapsRef = { value: null as ContactsMaps | null }
  const contactsMapsUserIdRef = { value: null as string | null }
  const contactsUnsubscribeRef = { value: null as (() => void) | null }
  const relayPullTimerRef = { value: null as number | null }
  const relayPullInFlightRef = { value: false }

  const ensureUserId = $(async () => {
    let userId = options.chatSettingsUserId.value
    if (!userId && typeof window !== 'undefined') {
      userId = await resolveChatSettingsUserId()
      if (userId) {
        options.chatSettingsUserId.value = userId
      }
    }
    return userId
  })

  const ensureContactsMaps = $(async () => {
    const userId = await ensureUserId()
    if (!userId) return null
    if (contactsMapsRef.value && contactsMapsUserIdRef.value === userId) return contactsMapsRef.value
    contactsUnsubscribeRef.value?.()
    const maps = await loadContactsMaps(userId)
    contactsMapsRef.value = maps
    contactsMapsUserIdRef.value = userId
    return maps
  })

  const applyInvitesPayload = $(
    (payload: ContactInvitesPayload, optionsState?: { offline?: boolean; stale?: boolean; updatedAt?: string }) => {
      const copy = options.fragmentCopy.value
      const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
      const offline = optionsState?.offline ?? false
      const stale = optionsState?.stale ?? false
      const updatedAt = optionsState?.updatedAt

      options.incoming.value = Array.isArray(payload.incoming) ? payload.incoming : []
      options.outgoing.value = Array.isArray(payload.outgoing) ? payload.outgoing : []
      options.contacts.value = Array.isArray(payload.contacts) ? payload.contacts : []
      const userId = options.chatSettingsUserId.value
      if (userId) {
        const storeSnapshot = syncContactsStoreFromInvitesPayload(userId, payload)
        const contactIds = options.contacts.value.map((invite) => invite.user.id)
        options.onlineIds.value = resolveOnlineContactIds(storeSnapshot, contactIds, defaultPresenceTtlMs)
      } else {
        options.onlineIds.value = []
      }
      if (options.activeContact.value) {
        const stillConnected = options.contacts.value.some(
          (invite) => invite.user.id === options.activeContact.value?.id
        )
        if (!stillConnected) {
          options.activeContact.value = null
          options.dmClosing.value = false
          options.dmOrigin.value = null
        }
      }
      if (options.searchResults.value.length) {
        const statusByUser = new Map<string, { status: ContactSearchResult['status']; inviteId: string }>()
        options.incoming.value.forEach((invite) =>
          statusByUser.set(invite.user.id, { status: 'incoming', inviteId: invite.id })
        )
        options.outgoing.value.forEach((invite) =>
          statusByUser.set(invite.user.id, { status: 'outgoing', inviteId: invite.id })
        )
        options.contacts.value.forEach((invite) =>
          statusByUser.set(invite.user.id, { status: 'accepted', inviteId: invite.id })
        )
        options.searchResults.value = options.searchResults.value.map((entry) => {
          const status = statusByUser.get(entry.id)
          if (!status) {
            return { ...entry, status: 'none', inviteId: undefined }
          }
          return { ...entry, status: status.status, inviteId: status.inviteId }
        })
      }
      const baseline = options.baselineCounts.value
      if (!baseline) {
        options.baselineCounts.value = {
          incoming: options.incoming.value.length,
          outgoing: options.outgoing.value.length,
          contacts: options.contacts.value.length
        }
      } else {
        const next = { ...baseline }
        let changed = false
        if (!Number.isFinite(next.incoming)) {
          next.incoming = options.incoming.value.length
          changed = true
        }
        if (!Number.isFinite(next.outgoing)) {
          next.outgoing = options.outgoing.value.length
          changed = true
        }
        if (!Number.isFinite(next.contacts)) {
          next.contacts = options.contacts.value.length
          changed = true
        }
        if (changed) {
          options.baselineCounts.value = next
        }
      }
      options.invitesState.value = 'idle'
      if (offline) {
        const formattedUpdatedAt = updatedAt ? new Date(updatedAt).toLocaleString() : null
        if (stale && formattedUpdatedAt) {
          options.statusTone.value = 'error'
          options.statusMessage.value = resolveLocal(`Offline - cached data from ${formattedUpdatedAt} may be stale.`)
        } else if (stale) {
          options.statusTone.value = 'error'
          options.statusMessage.value = resolveLocal('Offline - cached data may be stale.')
        } else {
          options.statusTone.value = 'neutral'
          options.statusMessage.value = resolveLocal('Offline - showing cached contacts.')
        }
        return
      }
      if (options.realtimeState.value === 'idle' || options.realtimeState.value === 'offline') {
        options.realtimeState.value = 'live'
      }
    }
  )

  const sendRelayPayload = $(async (targetUserId: string, payload: unknown) => {
    if (typeof window === 'undefined') return false
    if (isNetworkOffline()) return false
    const identity = options.identityRef.value
    const selfUserId = options.chatSettingsUserId.value
    if (!identity || !selfUserId) return false
    const relayUrls = resolveRelayUrls()
    const devices = await fetchRelayDevices({ userId: targetUserId, relayUrls })
    const relayIdentity = resolveRelayIdentity(identity)
    if (!devices.length) {
      const wakuRelays = resolveWakuRelays()
      const manager = createRelayManager(window.location.origin, {
        relayIdentity,
        discoveredRelays: [...relayUrls, ...wakuRelays]
      })
      const messageId = `contact:${createMessageId()}`
      const result = await manager.send({
        recipientId: targetUserId,
        messageId,
        payload,
        senderId: selfUserId,
        senderDeviceId: identity.deviceId
      })
      return (result?.delivered ?? 0) > 0
    }
    const results = await Promise.allSettled(
      devices.map(async (device) => {
        const manager = createRelayManager(window.location.origin, {
          relayIdentity,
          recipientRelayKey: device.relayPublicKey,
          discoveredRelays: device.relayUrls?.length ? device.relayUrls : relayUrls
        })
        const messageId = `contact:${device.deviceId}:${createMessageId()}`
        const result = await manager.send({
          recipientId: targetUserId,
          messageId,
          payload,
          deviceIds: [device.deviceId],
          senderId: selfUserId,
          senderDeviceId: identity.deviceId,
          recipientRelayKey: device.relayPublicKey
        })
        return result?.delivered ?? 0
      })
    )
    return results.some((result) => result.status === 'fulfilled' && result.value > 0)
  })

  const sendContactAction = $(async (optionsAction: {
    action: 'invite' | 'accept' | 'decline' | 'remove'
    inviteId: string
    targetUserId: string
    actor: { id: string; email: string; name?: string | null }
  }) => {
    const selfUserId = options.chatSettingsUserId.value
    if (!selfUserId) return false
    const event = buildContactInviteEvent({
      action: optionsAction.action,
      inviteId: optionsAction.inviteId,
      fromUserId: selfUserId,
      toUserId: optionsAction.targetUserId,
      user: optionsAction.actor
    })
    return sendRelayPayload(optionsAction.targetUserId, event)
  })

  const sendContactSync = $(async (optionsSync: {
    status: 'incoming' | 'outgoing' | 'accepted' | 'declined' | 'removed'
    inviteId: string
    contact: { id: string; email: string; name?: string | null }
  }) => {
    const selfUserId = options.chatSettingsUserId.value
    if (!selfUserId) return false
    const event = buildContactInviteEvent({
      action: 'sync',
      status: optionsSync.status,
      inviteId: optionsSync.inviteId,
      fromUserId: selfUserId,
      toUserId: selfUserId,
      user: optionsSync.contact
    })
    return sendRelayPayload(selfUserId, event)
  })

  const pullRelayInbox = $(async (identity: DeviceIdentity, userId: string) => {
    if (relayPullInFlightRef.value) return
    if (isNetworkOffline()) return
    relayPullInFlightRef.value = true
    try {
      const maps = await ensureContactsMaps()
      if (!maps) return
      const relayUrls = resolveRelayUrls()
      const manager = createRelayManager(window.location.origin, {
        relayIdentity: resolveRelayIdentity(identity),
        discoveredRelays: relayUrls
      })
      const messages = await manager.pull({
        deviceId: identity.deviceId,
        relayPublicKey: identity.relayPublicKey,
        userId,
        limit: 80
      })
      if (!messages.length) return
      const ackIds: string[] = []
      let presenceSnapshot = loadContactsStore(userId)
      maps.doc.transact(() => {
        messages.forEach((message) => {
          const event = parseContactInviteEvent(message.payload)
          if (!event || event.toUserId !== userId) return
          const entry = eventToContactEntry(event)
          if (!entry) return
          applyContactEntry(maps.contacts, entry)
          ackIds.push(message.id)
        })
      })
      messages.forEach((message) => {
        const presence = parseContactPresenceEvent(message.payload)
        if (!presence || presence.toUserId !== userId) return
        presenceSnapshot = updateContactPresence(userId, presence.fromUserId, { lastSeenAt: presence.updatedAt })
        ackIds.push(message.id)
      })
      const contactIds = options.contacts.value.map((invite) => invite.user.id)
      options.onlineIds.value = resolveOnlineContactIds(presenceSnapshot, contactIds, defaultPresenceTtlMs)
      if (ackIds.length) {
        await manager.ack(identity.deviceId, ackIds)
      }
    } finally {
      relayPullInFlightRef.value = false
    }
  })

  const flushRelayOutbox = $(async (identity: DeviceIdentity) => {
    if (isNetworkOffline()) return
    const relayUrls = resolveRelayUrls()
    const manager = createRelayManager(window.location.origin, {
      relayIdentity: resolveRelayIdentity(identity),
      discoveredRelays: relayUrls
    })
    await manager.flushOutgoing(identity.deviceId)
  })

  const flushQueuedActions = $(async () => {
    if (typeof window === 'undefined') return
    if (flushInFlight.value) return
    if (isNetworkOffline()) return
    const storageKey = queueStorageKey(options.chatSettingsUserId.value)
    const queued = loadQueuedActions(storageKey)
    if (!queued.length) return
    const selfUser = resolveSelfUser(options.chatSettingsUserId.value)
    const maps = await ensureContactsMaps()
    if (!selfUser || !maps) return

    flushInFlight.value = true
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const remaining: QueuedContactAction[] = []
    let refreshed = false

    try {
      for (const action of queued) {
        try {
          if (action.type === 'invite') {
            if (!action.userId) {
              remaining.push(action)
              continue
            }
            const relayDelivered = await sendContactAction({
              action: 'invite',
              inviteId: action.inviteId,
              targetUserId: action.userId,
              actor: selfUser
            })
            void sendContactSync({
              status: 'outgoing',
              inviteId: action.inviteId,
              contact: { id: action.userId, email: action.email }
            })
            if (!relayDelivered) {
              remaining.push(action)
              continue
            }
            options.statusTone.value = 'success'
            options.statusMessage.value = resolveLocal('Invite sent.')
            refreshed = true
            continue
          }

          if (action.type === 'accept') {
            const contact = readContactEntry(maps.contacts, action.userId)?.user ?? {
              id: action.userId,
              email: action.userId
            }
            const relayDelivered = await sendContactAction({
              action: 'accept',
              inviteId: action.inviteId,
              targetUserId: action.userId,
              actor: selfUser
            })
            void sendContactSync({
              status: 'accepted',
              inviteId: action.inviteId,
              contact
            })
            if (!relayDelivered) {
              remaining.push(action)
              continue
            }
            options.statusTone.value = 'success'
            options.statusMessage.value = resolveLocal('Invite accepted.')
            refreshed = true
            continue
          }

          if (action.type === 'decline') {
            const contact = readContactEntry(maps.contacts, action.userId)?.user ?? {
              id: action.userId,
              email: action.userId
            }
            const relayDelivered = await sendContactAction({
              action: 'decline',
              inviteId: action.inviteId,
              targetUserId: action.userId,
              actor: selfUser
            })
            void sendContactSync({
              status: 'removed',
              inviteId: action.inviteId,
              contact
            })
            if (!relayDelivered) {
              remaining.push(action)
              continue
            }
            options.statusTone.value = 'success'
            options.statusMessage.value = resolveLocal('Invite declined.')
            refreshed = true
            continue
          }

          if (action.type === 'remove') {
            const contact = readContactEntry(maps.contacts, action.userId)?.user ?? {
              id: action.userId,
              email: action.email
            }
            const relayDelivered = await sendContactAction({
              action: 'remove',
              inviteId: action.inviteId,
              targetUserId: action.userId,
              actor: selfUser
            })
            void sendContactSync({
              status: 'removed',
              inviteId: action.inviteId,
              contact
            })
            if (!relayDelivered) {
              remaining.push(action)
              continue
            }
            options.statusTone.value = 'success'
            options.statusMessage.value = resolveLocal('Invite removed.')
            refreshed = true
            continue
          }

          remaining.push(action)
        } catch (error) {
          options.statusTone.value = 'error'
          options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
          remaining.push(action)
        }
      }
    } finally {
      saveQueuedActions(storageKey, remaining)
      if (refreshed && maps) {
        const payload = serializeContactsPayload(maps.contacts)
        await applyInvitesPayload(payload)
      }
      flushInFlight.value = false
    }
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    void requestStoragePersistence()
    const updateOfflineState = () => {
      const offline = isNetworkOffline()
      options.offline.value = offline
      return offline
    }
    const handleOnline = () => {
      updateOfflineState()
      void flushQueuedActions()
    }
    const handleOffline = () => {
      updateOfflineState()
    }
    const handleSwMessage = (event: MessageEvent) => {
      const payload = event.data as Record<string, unknown> | null
      if (!payload || payload.type !== 'contact-invites:flush-queue') return
      void flushQueuedActions()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    navigator.serviceWorker?.addEventListener('message', handleSwMessage)
    ctx.track(() => options.realtimeState.value)
    ctx.track(() => options.chatSettingsUserId.value)
    migrateQueuedActions(queueStorageKey(), queueStorageKey(options.chatSettingsUserId.value))
    updateOfflineState()
    if (!isNetworkOffline() && options.realtimeState.value === 'live') {
      void flushQueuedActions()
    }
    ctx.cleanup(() => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage)
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    const userId = ctx.track(() => options.chatSettingsUserId.value)
    let active = true
    let cleanupObserver: (() => void) | null = null

    void (async () => {
      if (!userId) return
      const maps = await ensureContactsMaps()
      if (!maps || !active) return
      if (maps) {
        const payload = serializeContactsPayload(maps.contacts)
        await applyInvitesPayload(payload)
      }
      cleanupObserver = observeContacts(maps.contacts, () => {
        const payload = serializeContactsPayload(maps.contacts)
        void applyInvitesPayload(payload)
      })
      contactsUnsubscribeRef.value = cleanupObserver
    })()

    ctx.cleanup(() => {
      active = false
      cleanupObserver?.()
      if (contactsUnsubscribeRef.value === cleanupObserver) {
        contactsUnsubscribeRef.value = null
      }
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    const identity = ctx.track(() => options.identityRef.value)
    const userId = ctx.track(() => options.chatSettingsUserId.value)
    if (!identity || !userId) return
    let active = true

    const schedulePull = (delayMs: number) => {
      if (!active) return
      if (relayPullTimerRef.value !== null) {
        window.clearTimeout(relayPullTimerRef.value)
      }
      relayPullTimerRef.value = window.setTimeout(async () => {
        relayPullTimerRef.value = null
        await flushRelayOutbox(identity)
        await pullRelayInbox(identity, userId)
        schedulePull(14_000)
      }, delayMs)
    }

    const handleOnline = () => {
      void flushRelayOutbox(identity)
      schedulePull(0)
    }

    window.addEventListener('online', handleOnline)
    schedulePull(0)

    ctx.cleanup(() => {
      active = false
      if (relayPullTimerRef.value !== null) {
        window.clearTimeout(relayPullTimerRef.value)
        relayPullTimerRef.value = null
      }
      window.removeEventListener('online', handleOnline)
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    const userId = ctx.track(() => options.chatSettingsUserId.value)
    ctx.track(() => options.contacts.value.length)
    if (!userId) return
    let active = true
    const refreshOnlineIds = () => {
      if (!active) return
      const contactIds = options.contacts.value.map((invite) => invite.user.id)
      const snapshot = loadContactsStore(userId)
      options.onlineIds.value = resolveOnlineContactIds(snapshot, contactIds, defaultPresenceTtlMs)
    }
    const timer = window.setInterval(refreshOnlineIds, presenceRefreshIntervalMs)
    refreshOnlineIds()
    ctx.cleanup(() => {
      active = false
      window.clearInterval(timer)
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    const identity = ctx.track(() => options.identityRef.value)
    const userId = ctx.track(() => options.chatSettingsUserId.value)
    ctx.track(() => options.contacts.value.length)
    if (!identity || !userId) return
    let active = true
    const broadcastPresence = async () => {
      if (!active) return
      if (isNetworkOffline()) return
      const contactIds = options.contacts.value.map((invite) => invite.user.id)
      if (!contactIds.length) return
      await Promise.all(
        contactIds.map(async (contactId) => {
          const event = buildContactPresenceEvent({
            fromUserId: userId,
            toUserId: contactId,
            deviceId: identity.deviceId
          })
          await sendRelayPayload(contactId, event)
        })
      )
    }
    const timer = window.setInterval(broadcastPresence, presenceBroadcastIntervalMs)
    void broadcastPresence()
    ctx.cleanup(() => {
      active = false
      window.clearInterval(timer)
    })
  })

  const publishRelayIdentity = $(async (identity?: DeviceIdentity) => {
    if (typeof window === 'undefined') return false
    const userId = options.chatSettingsUserId.value
    const identityValue = identity ?? options.identityRef.value
    if (!userId || !identityValue) return false
    const relayUrls = resolveRelayUrls()
    const deviceOk = await publishRelayDevice({
      identity: identityValue,
      userId,
      relayUrls,
      label: buildRelayDirectoryLabels(identityValue)
    })
    const prekeyOk = await publishSignalPrekeys(identityValue, userId, relayUrls)
    return deviceOk || prekeyOk
  })

  const registerIdentity = $(async () => {
    const stored = await ensureStoredIdentity(loadStoredIdentity())
    saveStoredIdentity(stored)
    const identity = await importStoredIdentity(stored)
    options.identityRef.value = noSerialize(identity)
    void publishRelayIdentity(identity)
    void publishSignalPrekeys(identity, options.chatSettingsUserId.value, resolveRelayUrls())
    void registerPushSubscription(identity)
    return identity
  })

  const toggleChatSettings = $(() => {
    if (options.chatSettingsOpen.value) {
      restorePopoverFocus(options.chatSettingsPopoverRef.value, options.chatSettingsButtonRef.value)
      options.chatSettingsOpen.value = false
      return
    }
    options.chatSettingsOpen.value = true
  })

  const toggleReadReceipts = $(() => {
    const next = { ...options.chatSettings.value, readReceipts: !options.chatSettings.value.readReceipts }
    options.chatSettings.value = next
    saveChatSettings(options.chatSettingsUserId.value, next)
  })

  const toggleTypingIndicators = $(() => {
    const next = { ...options.chatSettings.value, typingIndicators: !options.chatSettings.value.typingIndicators }
    options.chatSettings.value = next
    saveChatSettings(options.chatSettingsUserId.value, next)
    if (!next.typingIndicators) {
      options.remoteTyping.value = false
      if (options.remoteTypingTimer.value !== null) {
        window.clearTimeout(options.remoteTypingTimer.value)
        options.remoteTypingTimer.value = null
      }
    }
  })

  const handleArchiveMessages = $(() => {
    const contact = options.activeContact.value
    if (!contact) return
    const identity = options.identityRef.value
    options.dmMessages.value = []
    options.dmError.value = null
    options.historySuppressed.value = true
    if (identity) {
      void archiveHistory(contact.id, identity)
    }
    restorePopoverFocus(options.chatSettingsPopoverRef.value, options.chatSettingsButtonRef.value)
    options.chatSettingsOpen.value = false
  })


  const refreshInvites = $(async (resetStatus = true) => {
    if (typeof window === 'undefined') return
    const maps = await ensureContactsMaps()
    const userId = options.chatSettingsUserId.value
    if (resetStatus) {
      options.statusMessage.value = null
      options.statusTone.value = 'neutral'
    }
    options.searchError.value = null
    if (!maps) {
      options.invitesState.value = 'error'
      options.statusTone.value = 'error'
      options.statusMessage.value = resolveFragmentCopy(options.fragmentCopy.value, 'Unable to load invites.')
      return
    }
    options.invitesState.value = 'loading'
    if (userId) {
      const transport = createLocalChatTransport()
      const payload = await transport.readContacts(userId)
      await applyInvitesPayload(payload)
    }

    const identity = options.identityRef.value
    if (identity && userId && !isNetworkOffline()) {
      try {
        await pullRelayInbox(identity, userId)
        const payload = serializeContactsPayload(maps.contacts)
        await applyInvitesPayload(payload)
      } catch (error) {
        options.statusTone.value = 'error'
        options.statusMessage.value =
          error instanceof Error ? error.message : resolveFragmentCopy(options.fragmentCopy.value, 'Unable to load invites.')
      }
    }
  })

  const handleSearchInput = $((event: Event) => {
    const value = (event.target as HTMLInputElement).value
    options.searchQuery.value = value
    options.searchResults.value = []
    options.searchState.value = 'idle'
    options.searchError.value = null
  })

  const handleSearchSubmit = $(async () => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const trimmed = options.searchQuery.value.trim()
    if (!trimmed) {
      options.searchResults.value = []
      options.searchState.value = 'idle'
      options.searchError.value = null
      return
    }

    const normalized = trimmed.toLowerCase()
    const contactMatches = options.contacts.value.filter((invite) => {
      const emailMatch = invite.user.email.toLowerCase().includes(normalized)
      const nameMatch = invite.user.name?.toLowerCase().includes(normalized) ?? false
      return emailMatch || nameMatch
    })
    if (contactMatches.length > 0) {
      options.searchResults.value = []
      options.searchState.value = 'idle'
      options.searchError.value = null
      return
    }

    options.searchState.value = 'loading'
    options.searchError.value = null

    const knownIds = new Set(
      [...options.contacts.value, ...options.incoming.value, ...options.outgoing.value].map((invite) => invite.user.id)
    )
    if (looksLikeUserId(trimmed) && !knownIds.has(trimmed)) {
      options.searchResults.value = [
        {
          id: trimmed,
          name: null,
          email: trimmed,
          status: 'none',
          inviteId: undefined
        }
      ]
      options.searchError.value = null
      options.searchState.value = 'idle'
      return
    }
    options.searchResults.value = []
    options.searchState.value = 'idle'
    options.searchError.value = resolveLocal('Local search only - enter a user ID to invite.')
  })

  const handleInvite = $(async (email: string, _userId?: string) => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const normalizedEmail = email.trim()
    const key = `invite:${normalizedEmail}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const selfUserId = await ensureUserId()
      const selfUser = resolveSelfUser(selfUserId)
      if (!selfUser) {
        options.statusTone.value = 'error'
        options.statusMessage.value = resolveLocal('Invite unavailable.')
        return
      }
      const code = ensureFriendCode(selfUser)
      let copied = false
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(code)
          copied = true
        } catch {
          copied = false
        }
      }
      options.statusTone.value = 'success'
      options.statusMessage.value = copied
        ? resolveLocal('Friend code copied. Share it to connect.')
        : resolveLocal('Friend code ready. Share it from Settings.')
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const handleImportInviteToken = $(async (token: string) => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const parsed = decodeInviteToken(token)
    if (!parsed) {
      options.statusTone.value = 'error'
      options.statusMessage.value = resolveLocal('Invalid invite code.')
      return
    }
    const entry = eventToContactEntry(parsed)
    if (!entry) {
      options.statusTone.value = 'error'
      options.statusMessage.value = resolveLocal('Invite unavailable.')
      return
    }
    if (parsed.action === 'invite') {
      entry.status = 'accepted'
      entry.updatedAt = new Date().toISOString()
    }
    const maps = await ensureContactsMaps()
    if (!maps) {
      options.statusTone.value = 'error'
      options.statusMessage.value = resolveLocal('Invite unavailable.')
      return
    }
    maps.doc.transact(() => {
      applyContactEntry(maps.contacts, entry, { force: true })
    })
    const payload = serializeContactsPayload(maps.contacts)
    await applyInvitesPayload(payload)
    options.statusTone.value = 'success'
    const message =
      parsed.action === 'invite' || parsed.action === 'accept'
        ? 'Invite accepted.'
        : parsed.action === 'decline'
          ? 'Invite declined.'
            : parsed.action === 'remove'
              ? 'Invite removed.'
              : 'Invite updated.'
    options.statusMessage.value = resolveLocal(message)
  })

  const handleAccept = $(async (inviteId: string, userId: string) => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const key = `accept:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const selfUserId = await ensureUserId()
      const storageKey = queueStorageKey(selfUserId)
      const maps = await ensureContactsMaps()
      const selfUser = resolveSelfUser(selfUserId)
      if (!maps || !selfUser) {
        options.statusTone.value = 'error'
        options.statusMessage.value = resolveLocal('Invite unavailable.')
        return
      }
      const contact = readContactEntry(maps.contacts, userId)?.user ?? { id: userId, email: userId }
      maps.doc.transact(() => {
        applyContactEntry(maps.contacts, {
          inviteId,
          status: 'accepted',
          user: contact,
          updatedAt: new Date().toISOString(),
          source: 'local'
        }, { force: true })
      })
      if (maps) {
        const payload = serializeContactsPayload(maps.contacts)
        await applyInvitesPayload(payload)
      }

      if (isNetworkOffline()) {
        enqueueQueuedAction(storageKey, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'accept',
          inviteId,
          userId,
          createdAt: new Date().toISOString()
        })
        void requestInviteQueueSync('accept')
        options.statusTone.value = 'neutral'
        options.statusMessage.value = resolveLocal('Offline - accept queued.')
        return
      }

      const relayDelivered = await sendContactAction({
        action: 'accept',
        inviteId,
        targetUserId: userId,
        actor: selfUser
      })
      void sendContactSync({ status: 'accepted', inviteId, contact })

      if (!relayDelivered) {
        enqueueQueuedAction(storageKey, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'accept',
          inviteId,
          userId,
          createdAt: new Date().toISOString()
        })
        void requestInviteQueueSync('accept')
        options.statusTone.value = 'neutral'
        options.statusMessage.value = resolveLocal('Invite queued.')
        return
      }

      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite accepted.')
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const handleDecline = $(async (inviteId: string, userId: string) => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const key = `decline:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const selfUserId = await ensureUserId()
      const storageKey = queueStorageKey(selfUserId)
      const maps = await ensureContactsMaps()
      const selfUser = resolveSelfUser(selfUserId)
      if (!maps || !selfUser) {
        options.statusTone.value = 'error'
        options.statusMessage.value = resolveLocal('Invite unavailable.')
        return
      }
      const contact = readContactEntry(maps.contacts, userId)?.user ?? { id: userId, email: userId }
      maps.doc.transact(() => {
        applyContactEntry(maps.contacts, {
          inviteId,
          status: 'removed',
          user: contact,
          updatedAt: new Date().toISOString(),
          source: 'local'
        }, { force: true })
      })
      if (maps) {
        const payload = serializeContactsPayload(maps.contacts)
        await applyInvitesPayload(payload)
      }

      if (isNetworkOffline()) {
        enqueueQueuedAction(storageKey, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'decline',
          inviteId,
          userId,
          createdAt: new Date().toISOString()
        })
        void requestInviteQueueSync('decline')
        options.statusTone.value = 'neutral'
        options.statusMessage.value = resolveLocal('Offline - decline queued.')
        return
      }

      const relayDelivered = await sendContactAction({
        action: 'decline',
        inviteId,
        targetUserId: userId,
        actor: selfUser
      })
      void sendContactSync({ status: 'removed', inviteId, contact })

      if (!relayDelivered) {
        enqueueQueuedAction(storageKey, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'decline',
          inviteId,
          userId,
          createdAt: new Date().toISOString()
        })
        void requestInviteQueueSync('decline')
        options.statusTone.value = 'neutral'
        options.statusMessage.value = resolveLocal('Invite queued.')
        return
      }

      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite declined.')
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const handleRemove = $(async (inviteId: string, userId: string, email: string) => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const key = `remove:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const selfUserId = await ensureUserId()
      const storageKey = queueStorageKey(selfUserId)
      const maps = await ensureContactsMaps()
      const selfUser = resolveSelfUser(selfUserId)
      if (!maps || !selfUser) {
        options.statusTone.value = 'error'
        options.statusMessage.value = resolveLocal('Invite unavailable.')
        return
      }
      const contact = readContactEntry(maps.contacts, userId)?.user ?? { id: userId, email }
      maps.doc.transact(() => {
        applyContactEntry(maps.contacts, {
          inviteId,
          status: 'removed',
          user: contact,
          updatedAt: new Date().toISOString(),
          source: 'local'
        }, { force: true })
      })
      if (maps) {
        const payload = serializeContactsPayload(maps.contacts)
        await applyInvitesPayload(payload)
      }

      if (isNetworkOffline()) {
        enqueueQueuedAction(storageKey, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'remove',
          inviteId,
          userId,
          email,
          createdAt: new Date().toISOString()
        })
        void requestInviteQueueSync('remove')
        options.statusTone.value = 'neutral'
        options.statusMessage.value = resolveLocal('Offline - removal queued.')
        return
      }

      const relayDelivered = await sendContactAction({
        action: 'remove',
        inviteId,
        targetUserId: userId,
        actor: selfUser
      })
      void sendContactSync({ status: 'removed', inviteId, contact })

      if (!relayDelivered) {
        enqueueQueuedAction(storageKey, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'remove',
          inviteId,
          userId,
          email,
          createdAt: new Date().toISOString()
        })
        void requestInviteQueueSync('remove')
        options.statusTone.value = 'neutral'
        options.statusMessage.value = resolveLocal('Invite queued.')
        return
      }

      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite removed.')
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const toggleBell = $(() => {
    options.bellOpen.value = !options.bellOpen.value
  })

  const handleContactClick = $((event: Event, contact: ContactSearchItem) => {
    if (!contact.isContact) return
    const target = event.target as Element | null
    if (target?.closest('button')) return
    const card =
      (target?.closest('[data-contact-card="true"]') as HTMLElement | null) ??
      (event.currentTarget as HTMLElement | null)
    if (card && typeof window !== 'undefined') {
      const rect = card.getBoundingClientRect()
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height
      const scaleX = viewportWidth ? rect.width / viewportWidth : 1
      const scaleY = viewportHeight ? rect.height / viewportHeight : 1
      options.dmOrigin.value = {
        x: rect.left,
        y: rect.top,
        scaleX: Math.min(Math.max(scaleX, dmMinScale), 1),
        scaleY: Math.min(Math.max(scaleY, dmMinScale), 1),
        radius: dmOriginRadius
      }
    } else {
      options.dmOrigin.value = null
    }
    options.dmClosing.value = false
    options.dmAnimated.value = false
    options.activeContact.value = {
      id: contact.id,
      name: contact.name ?? null,
      email: contact.email,
      online: !!contact.online
    }
  })

  const handleContactKeyDown = $((event: KeyboardEvent, contact: ContactSearchItem) => {
    if (!contact.isContact) return
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
    event.preventDefault()
    const target = event.target as Element | null
    const card =
      (target?.closest('[data-contact-card="true"]') as HTMLElement | null) ??
      (event.currentTarget as HTMLElement | null)
    if (card && typeof window !== 'undefined') {
      const rect = card.getBoundingClientRect()
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height
      const scaleX = viewportWidth ? rect.width / viewportWidth : 1
      const scaleY = viewportHeight ? rect.height / viewportHeight : 1
      options.dmOrigin.value = {
        x: rect.left,
        y: rect.top,
        scaleX: Math.min(Math.max(scaleX, dmMinScale), 1),
        scaleY: Math.min(Math.max(scaleY, dmMinScale), 1),
        radius: dmOriginRadius
      }
    } else {
      options.dmOrigin.value = null
    }
    options.dmClosing.value = false
    options.dmAnimated.value = false
    options.activeContact.value = {
      id: contact.id,
      name: contact.name ?? null,
      email: contact.email,
      online: !!contact.online
    }
  })

  const closeContact = $(() => {
    if (!options.activeContact.value || options.dmClosing.value) return
    options.dmClosing.value = true
    if (typeof window === 'undefined') {
      options.activeContact.value = null
      options.dmClosing.value = false
      options.dmAnimated.value = false
      options.dmOrigin.value = null
      return
    }
    window.setTimeout(() => {
      options.activeContact.value = null
      options.dmClosing.value = false
      options.dmAnimated.value = false
      options.dmOrigin.value = null
    }, dmCloseDelayMs)
  })

  return {
    registerIdentity,
    publishRelayIdentity,
    toggleChatSettings,
    toggleReadReceipts,
    toggleTypingIndicators,
    handleArchiveMessages,
    refreshInvites,
    handleSearchInput,
    handleSearchSubmit,
    handleInvite,
    handleImportInviteToken,
    handleAccept,
    handleDecline,
    handleRemove,
    toggleBell,
    handleContactClick,
    handleContactKeyDown,
    closeContact
  }
}

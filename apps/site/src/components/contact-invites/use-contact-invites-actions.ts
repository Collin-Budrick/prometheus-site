import { $, noSerialize, useVisibleTask$, type NoSerialize, type Signal } from '@builder.io/qwik'
import { saveChatSettings, type ChatSettings } from '../../shared/chat-settings'
import { appConfig } from '../../app-config'
import {
  createStoredIdentity,
  ensureStoredIdentity,
  importStoredIdentity,
  loadStoredIdentity,
  saveStoredIdentity,
  type DeviceIdentity
} from '../../shared/p2p-crypto'
import { buildApiUrl, resolveApiHost } from './api'
import { dmCloseDelayMs, dmMinScale, dmOriginRadius } from './constants'
import { archiveHistory } from './history'
import { registerPushSubscription } from './push'
import { publishRelayDevice, buildRelayDirectoryLabels, fetchRelayDevices } from './relay-directory'
import { createRelayManager } from './relay'
import { publishSignalPrekeys } from './signal'
import { markServerFailure, markServerSuccess, shouldAttemptServer } from '../../shared/server-backoff'
import {
  applyContactEntry,
  loadContactsMaps,
  mergeContactsPayload,
  observeContacts,
  readContactEntry,
  serializeContactsPayload
} from './contacts-crdt'
import { buildContactInviteEvent, eventToContactEntry, parseContactInviteEvent } from './contacts-relay'
import { createMessageId } from './utils'
import type {
  ActiveContact,
  BaselineInviteCounts,
  ContactInviteView,
  ContactInvitesPayload,
  ContactSearchItem,
  ContactSearchPayload,
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
const resolveServerKey = () => {
  if (typeof window === 'undefined') return 'default'
  return resolveApiHost(window.location.origin)
}

const restorePopoverFocus = (
  popover: HTMLDivElement | undefined,
  button: HTMLButtonElement | undefined
) => {
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (!popover || !active || !popover.contains(active)) return
  button?.focus()
}

export const useContactInvitesActions = (options: ContactInvitesActionsOptions) => {
  const flushInFlight = { value: false }
  let contactsMaps: Awaited<ReturnType<typeof loadContactsMaps>> | null = null
  let contactsMapsUserId: string | null = null
  const contactsUnsubscribeRef = { value: null as (() => void) | null }
  const relayPullTimerRef = { value: null as number | null }
  let relayPullInFlight = false

  const resolveSelfUser = () => {
    const userId = options.chatSettingsUserId.value
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

  const resolveRelayUrls = () =>
    [
      ...(appConfig.p2pRelayBases ?? []),
      ...(appConfig.p2pNostrRelays ?? []),
      ...(appConfig.p2pWakuRelays ?? [])
    ].filter(Boolean)

  const ensureContactsMaps = async () => {
    const userId = options.chatSettingsUserId.value
    if (!userId) return null
    if (contactsMaps && contactsMapsUserId === userId) return contactsMaps
    contactsUnsubscribeRef.value?.()
    contactsMaps = await loadContactsMaps(userId)
    contactsMapsUserId = userId
    return contactsMaps
  }

  const sendRelayEvent = async (targetUserId: string, event: ReturnType<typeof buildContactInviteEvent>) => {
    if (typeof window === 'undefined') return false
    if (isNetworkOffline()) return false
    const identity = options.identityRef.value
    const selfUserId = options.chatSettingsUserId.value
    if (!identity || !selfUserId) return false
    const relayUrls = resolveRelayUrls()
    const devices = await fetchRelayDevices({ userId: targetUserId, relayUrls })
    if (!devices.length) return false
    const relayIdentity = resolveRelayIdentity(identity)
    const results = await Promise.allSettled(
      devices.map(async (device) => {
        const manager = createRelayManager(window.location.origin, {
          relayIdentity,
          recipientRelayKey: device.relayPublicKey,
          discoveredRelays: device.relayUrls?.length ? device.relayUrls : relayUrls
        })
        const messageId = `contact:${event.inviteId}:${device.deviceId}:${createMessageId()}`
        const result = await manager.send({
          recipientId: targetUserId,
          messageId,
          payload: event,
          deviceIds: [device.deviceId],
          senderId: selfUserId,
          senderDeviceId: identity.deviceId,
          recipientRelayKey: device.relayPublicKey
        })
        return result?.delivered ?? 0
      })
    )
    return results.some((result) => result.status === 'fulfilled' && result.value > 0)
  }

  const sendContactAction = async (optionsAction: {
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
    return sendRelayEvent(optionsAction.targetUserId, event)
  }

  const sendContactSync = async (optionsSync: {
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
    return sendRelayEvent(selfUserId, event)
  }

  const pullRelayInbox = async (identity: DeviceIdentity, userId: string) => {
    if (relayPullInFlight) return
    if (isNetworkOffline()) return
    relayPullInFlight = true
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
      if (ackIds.length) {
        await manager.ack(identity.deviceId, ackIds)
      }
    } finally {
      relayPullInFlight = false
    }
  }

  const sendInviteViaServer = async (email: string) => {
    const serverKey = resolveServerKey()
    if (!shouldAttemptServer(serverKey)) return null
    try {
      const response = await fetch(buildApiUrl('/chat/contacts/invites', window.location.origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      })
      if (!response.ok) {
        if (response.status >= 500) {
          markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
        }
        return null
      }
      const payload = (await response.json()) as { id?: string }
      markServerSuccess(serverKey)
      return payload.id ?? null
    } catch {
      markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
      return null
    }
  }

  const sendInviteActionViaServer = async (
    action: 'accept' | 'decline' | 'remove',
    inviteId: string
  ) => {
    const serverKey = resolveServerKey()
    if (!shouldAttemptServer(serverKey)) return false
    const encoded = encodeURIComponent(inviteId)
    const path =
      action === 'accept'
        ? `/chat/contacts/invites/${encoded}/accept`
        : action === 'decline'
          ? `/chat/contacts/invites/${encoded}/decline`
          : `/chat/contacts/invites/${encoded}`
    const method = action === 'remove' ? 'DELETE' : 'POST'
    try {
      const response = await fetch(buildApiUrl(path, window.location.origin), {
        method,
        credentials: 'include'
      })
      if (!response.ok) {
        if (response.status >= 500) {
          markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
        }
        return false
      }
      markServerSuccess(serverKey)
      return true
    } catch {
      markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
      return false
    }
  }

  const flushQueuedActions = $(async () => {
    if (typeof window === 'undefined') return
    if (flushInFlight.value) return
    if (isNetworkOffline()) return
    const storageKey = queueStorageKey(options.chatSettingsUserId.value)
    const queued = loadQueuedActions(storageKey)
    if (!queued.length) return
    const selfUser = resolveSelfUser()
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
              const serverInviteId = await sendInviteViaServer(action.email)
              if (!serverInviteId) {
                remaining.push(action)
                continue
              }
              const entry = {
                inviteId: serverInviteId,
                status: 'outgoing' as const,
                user: { id: action.userId ?? action.email, email: action.email },
                updatedAt: new Date().toISOString(),
                source: 'server' as const
              }
              maps.doc.transact(() => {
                applyContactEntry(maps.contacts, entry)
              })
              refreshed = true
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
              const serverInviteId = await sendInviteViaServer(action.email)
              if (!serverInviteId) {
                remaining.push(action)
                continue
              }
              const entry = {
                inviteId: serverInviteId,
                status: 'outgoing' as const,
                user: { id: action.userId, email: action.email },
                updatedAt: new Date().toISOString(),
                source: 'server' as const
              }
              maps.doc.transact(() => {
                applyContactEntry(maps.contacts, entry)
              })
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
              const serverOk = await sendInviteActionViaServer('accept', action.inviteId)
              if (!serverOk) {
                remaining.push(action)
                continue
              }
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
              const serverOk = await sendInviteActionViaServer('decline', action.inviteId)
              if (!serverOk) {
                remaining.push(action)
                continue
              }
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
              const serverOk = await sendInviteActionViaServer('remove', action.inviteId)
              if (!serverOk) {
                remaining.push(action)
                continue
              }
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
      if (refreshed) {
        applyContactsFromMaps(maps)
      }
      flushInFlight.value = false
    }
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    void requestStoragePersistence()
    const updateOfflineState = () => {
      const serverKey = resolveServerKey()
      const offline = isNetworkOffline() || !shouldAttemptServer(serverKey)
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
      applyContactsFromMaps(maps)
      cleanupObserver = observeContacts(maps.contacts, () => {
        applyContactsFromMaps(maps)
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
        await pullRelayInbox(identity, userId)
        schedulePull(14_000)
      }, delayMs)
    }

    const handleOnline = () => {
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

  const publishRelayIdentity = $(async (identity?: DeviceIdentity) => {
    if (typeof window === 'undefined') return false
    const userId = options.chatSettingsUserId.value
    const identityValue = identity ?? options.identityRef.value
    if (!userId || !identityValue) return false
    const relayUrls = [
      ...(appConfig.p2pRelayBases ?? []),
      ...(appConfig.p2pNostrRelays ?? []),
      ...(appConfig.p2pWakuRelays ?? [])
    ].filter(Boolean)
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
    let stored = await ensureStoredIdentity(loadStoredIdentity())
    saveStoredIdentity(stored)
    let identity = await importStoredIdentity(stored)
    let registered = false
    try {
      const serverKey = resolveApiHost(window.location.origin)
      if (!shouldAttemptServer(serverKey)) {
        options.identityRef.value = noSerialize(identity)
        void publishRelayIdentity(identity)
        return identity
      }
      const label = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 64) : 'browser'
      const relayUrls = [
        ...(appConfig.p2pRelayBases ?? []),
        ...(appConfig.p2pNostrRelays ?? []),
        ...(appConfig.p2pWakuRelays ?? [])
      ].filter(Boolean)
      const registerDevice = async () => {
        const response = await fetch(buildApiUrl('/chat/p2p/device', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            deviceId: identity.deviceId,
            publicKey: identity.publicKeyJwk,
            relayPublicKey: identity.relayPublicKey,
            relayUrls,
            label
          })
        })
        if (response.status < 500) {
          markServerSuccess(serverKey)
        } else {
          markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
        }
        if (response.status === 409) {
          return { ok: false, conflict: true }
        }
        if (!response.ok) {
          return { ok: false }
        }
        const payload = (await response.json()) as { deviceId?: string }
        if (payload.deviceId && payload.deviceId !== identity.deviceId) {
          stored = { ...stored, deviceId: payload.deviceId }
          saveStoredIdentity(stored)
          identity = await importStoredIdentity(stored)
        }
        return { ok: true }
      }
      let result = await registerDevice()
      if (!result.ok && result.conflict) {
        stored = await createStoredIdentity()
        saveStoredIdentity(stored)
        identity = await importStoredIdentity(stored)
        result = await registerDevice()
      }
      registered = result.ok
      if (registered) {
        void publishSignalPrekeys(identity, options.chatSettingsUserId.value, relayUrls)
        void registerPushSubscription(identity)
      }
    } catch {
      markServerFailure(resolveApiHost(window.location.origin), { baseDelayMs: 3000, maxDelayMs: 120000 })
      // ignore registration failures; retry later
    }
    options.identityRef.value = noSerialize(identity)
    void publishRelayIdentity(identity)
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

  const applyInvitesPayload = (
    payload: ContactInvitesPayload,
    optionsState?: { offline?: boolean; stale?: boolean; updatedAt?: string }
  ) => {
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const offline = optionsState?.offline ?? false
    const stale = optionsState?.stale ?? false
    const updatedAt = optionsState?.updatedAt

    options.incoming.value = Array.isArray(payload.incoming) ? payload.incoming : []
    options.outgoing.value = Array.isArray(payload.outgoing) ? payload.outgoing : []
    options.contacts.value = Array.isArray(payload.contacts) ? payload.contacts : []
    options.onlineIds.value = options.onlineIds.value.filter((id) =>
      options.contacts.value.some((invite) => invite.user.id === id)
    )
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

  const applyContactsFromMaps = (maps: Awaited<ReturnType<typeof ensureContactsMaps>>) => {
    if (!maps) return
    const payload = serializeContactsPayload(maps.contacts)
    applyInvitesPayload(payload)
  }

  const refreshInvites = $(async (resetStatus = true) => {
    if (typeof window === 'undefined') return
    const maps = await ensureContactsMaps()
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
    applyContactsFromMaps(maps)

    const serverKey = resolveServerKey()
    if (!shouldAttemptServer(serverKey)) return

    try {
      const response = await fetch(buildApiUrl('/chat/contacts/invites', window.location.origin), {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      })

      if (!response.ok) {
        if (response.status >= 500) {
          markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
        }
        return
      }

      const payload = (await response.json()) as ContactInvitesPayload
      maps.doc.transact(() => {
        mergeContactsPayload(maps.contacts, payload, 'server')
      })
      applyContactsFromMaps(maps)
      markServerSuccess(serverKey)
    } catch (error) {
      markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveFragmentCopy(options.fragmentCopy.value, 'Unable to load invites.')
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

    try {
      const serverKey = resolveServerKey()
      if (isNetworkOffline() || !shouldAttemptServer(serverKey)) {
        options.searchState.value = 'idle'
        options.searchError.value = null
        return
      }
      const response = await fetch(
        buildApiUrl(`/chat/contacts/search?email=${encodeURIComponent(trimmed)}`, window.location.origin),
        { credentials: 'include', headers: { Accept: 'application/json' } }
      )

      if (!response.ok) {
        if (response.status >= 500) {
          markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
        }
        let errorMessage = resolveLocal('Unable to search.')
        try {
          const payload = (await response.json()) as { error?: string }
          if (payload?.error) errorMessage = payload.error
        } catch {
          // ignore parsing failures
        }
        options.searchState.value = 'error'
        options.searchError.value = errorMessage
        return
      }

      const payload = (await response.json()) as ContactSearchPayload
      const contactIds = new Set(options.contacts.value.map((invite) => invite.user.id))
      const results = Array.isArray(payload.results) ? payload.results : []
      options.searchResults.value = results.filter((result) => !contactIds.has(result.id))
      options.searchState.value = 'idle'
      markServerSuccess(serverKey)
    } catch (error) {
      markServerFailure(resolveServerKey(), { baseDelayMs: 3000, maxDelayMs: 120000 })
      options.searchState.value = 'error'
      options.searchError.value = error instanceof Error ? error.message : resolveLocal('Unable to search.')
    }
  })

  const handleInvite = $(async (email: string, userId?: string) => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const storageKey = queueStorageKey(options.chatSettingsUserId.value)
    const key = `invite:${email}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const maps = await ensureContactsMaps()
      const selfUser = resolveSelfUser()
      if (!maps || !selfUser) {
        options.statusTone.value = 'error'
        options.statusMessage.value = resolveLocal('Invite unavailable.')
        return
      }
      const inviteId = createMessageId()
      const matching = options.searchResults.value.find((entry) => entry.email === email || entry.id === userId)
      const contact = {
        id: userId ?? email,
        email,
        name: matching?.name ?? undefined
      }
      maps.doc.transact(() => {
        applyContactEntry(maps.contacts, {
          inviteId,
          status: 'outgoing',
          user: contact,
          updatedAt: new Date().toISOString(),
          source: 'local'
        })
      })
      applyContactsFromMaps(maps)

      if (isNetworkOffline()) {
        enqueueQueuedAction(storageKey, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'invite',
          inviteId,
          email,
          userId,
          createdAt: new Date().toISOString()
        })
        void requestInviteQueueSync('invite')
        options.statusTone.value = 'neutral'
        options.statusMessage.value = resolveLocal('Offline - invite queued.')
        return
      }

      let delivered = false
      if (userId) {
        delivered = await sendContactAction({
          action: 'invite',
          inviteId,
          targetUserId: userId,
          actor: selfUser
        })
        void sendContactSync({ status: 'outgoing', inviteId, contact })
      }

      if (!delivered) {
        const serverInviteId = await sendInviteViaServer(email)
        if (!serverInviteId) {
          enqueueQueuedAction(storageKey, {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type: 'invite',
            inviteId,
            email,
            userId,
            createdAt: new Date().toISOString()
          })
          void requestInviteQueueSync('invite')
          options.statusTone.value = 'neutral'
          options.statusMessage.value = resolveLocal('Invite queued.')
          return
        }
        maps.doc.transact(() => {
          applyContactEntry(maps.contacts, {
            inviteId: serverInviteId,
            status: 'outgoing',
            user: contact,
            updatedAt: new Date().toISOString(),
            source: 'server'
          })
        })
        applyContactsFromMaps(maps)
      }

      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite sent.')
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const handleAccept = $(async (inviteId: string, userId: string) => {
    if (typeof window === 'undefined') return
    const copy = options.fragmentCopy.value
    const resolveLocal = (value: string) => resolveFragmentCopy(copy, value)
    const storageKey = queueStorageKey(options.chatSettingsUserId.value)
    const key = `accept:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const maps = await ensureContactsMaps()
      const selfUser = resolveSelfUser()
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
        })
      })
      applyContactsFromMaps(maps)

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
        const serverOk = await sendInviteActionViaServer('accept', inviteId)
        if (!serverOk) {
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
    const storageKey = queueStorageKey(options.chatSettingsUserId.value)
    const key = `decline:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const maps = await ensureContactsMaps()
      const selfUser = resolveSelfUser()
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
        })
      })
      applyContactsFromMaps(maps)

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
        const serverOk = await sendInviteActionViaServer('decline', inviteId)
        if (!serverOk) {
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
    const storageKey = queueStorageKey(options.chatSettingsUserId.value)
    const key = `remove:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    try {
      const maps = await ensureContactsMaps()
      const selfUser = resolveSelfUser()
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
        })
      })
      applyContactsFromMaps(maps)

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
        const serverOk = await sendInviteActionViaServer('remove', inviteId)
        if (!serverOk) {
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
    handleAccept,
    handleDecline,
    handleRemove,
    toggleBell,
    handleContactClick,
    handleContactKeyDown,
    closeContact
  }
}

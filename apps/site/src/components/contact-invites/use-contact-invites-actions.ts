import { $, noSerialize, type NoSerialize, type Signal } from '@builder.io/qwik'
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
import { buildApiUrl } from './api'
import { dmCloseDelayMs, dmMinScale, dmOriginRadius } from './constants'
import { archiveHistory } from './history'
import { registerPushSubscription } from './push'
import { publishSignalPrekeys } from './signal'
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
  identityRef: Signal<NoSerialize<DeviceIdentity> | undefined>
  remoteTyping: Signal<boolean>
  remoteTypingTimer: Signal<number | null>
}

export const useContactInvitesActions = (options: ContactInvitesActionsOptions) => {
  const registerIdentity = $(async () => {
    let stored = loadStoredIdentity()
    stored = await ensureStoredIdentity(stored)
    saveStoredIdentity(stored)
    let identity = await importStoredIdentity(stored)
    let registered = false
    try {
      const label = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 64) : 'browser'
      const relayUrls = [
        ...(appConfig.p2pRelayBases ?? []),
        ...(appConfig.p2pNostrRelays ?? [])
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
        void publishSignalPrekeys(identity)
        void registerPushSubscription(identity)
      }
    } catch {
      // ignore registration failures; retry later
    }
    options.identityRef.value = noSerialize(identity)
    return identity
  })

  const isAlertCount = (key: keyof BaselineInviteCounts, value: number) => {
    const baseline = options.baselineCounts.value
    if (!baseline) return false
    const previous = baseline[key]
    if (!Number.isFinite(previous)) return false
    return value > previous
  }

  const toggleChatSettings = $(() => {
    options.chatSettingsOpen.value = !options.chatSettingsOpen.value
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
    options.chatSettingsOpen.value = false
  })

  const refreshInvites = $(async (resetStatus = true) => {
    if (typeof window === 'undefined') return
    const copyValue = options.fragmentCopy.value
    const resolveLocal = (value: string) => copyValue?.[value] ?? value

    options.invitesState.value = 'loading'
    if (resetStatus) {
      options.statusMessage.value = null
      options.statusTone.value = 'neutral'
    }
    options.searchError.value = null

    try {
      const response = await fetch(buildApiUrl('/chat/contacts/invites', window.location.origin), {
        credentials: 'include'
      })

      if (!response.ok) {
        options.invitesState.value = 'error'
        options.statusTone.value = 'error'
        options.statusMessage.value = resolveLocal('Unable to load invites.')
        return
      }

      const payload = (await response.json()) as ContactInvitesPayload
      options.incoming.value = Array.isArray(payload.incoming) ? payload.incoming : []
      options.outgoing.value = Array.isArray(payload.outgoing) ? payload.outgoing : []
      options.contacts.value = Array.isArray(payload.contacts) ? payload.contacts : []
      options.onlineIds.value = []
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
    } catch (error) {
      options.invitesState.value = 'error'
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Unable to load invites.')
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

    const copyValue = options.fragmentCopy.value
    const resolveLocal = (value: string) => copyValue?.[value] ?? value

    options.searchState.value = 'loading'
    options.searchError.value = null

    try {
      const response = await fetch(
        buildApiUrl(`/chat/contacts/search?email=${encodeURIComponent(trimmed)}`, window.location.origin),
        { credentials: 'include' }
      )

      if (!response.ok) {
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
    } catch (error) {
      options.searchState.value = 'error'
      options.searchError.value = error instanceof Error ? error.message : resolveLocal('Unable to search.')
    }
  })

  const handleInvite = $(async (email: string, userId?: string) => {
    if (typeof window === 'undefined') return
    const key = `invite:${email}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    const copyValue = options.fragmentCopy.value
    const resolveLocal = (value: string) => copyValue?.[value] ?? value

    try {
      const response = await fetch(buildApiUrl('/chat/contacts/invites', window.location.origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      })

      if (!response.ok) {
        let errorMessage = resolveLocal('Invite unavailable.')
        try {
          const payload = (await response.json()) as { error?: string }
          if (payload?.error) errorMessage = payload.error
        } catch {
          // ignore parsing failures
        }
        options.statusTone.value = 'error'
        options.statusMessage.value = errorMessage
        return
      }

      const payload = (await response.json()) as { id?: string; status?: string }
      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite sent.')
      if (userId) {
        options.searchResults.value = options.searchResults.value.map((entry) =>
          entry.id === userId
            ? { ...entry, status: 'outgoing', inviteId: payload.id ?? entry.inviteId }
            : entry
        )
      }
      if (
        options.realtimeState.value === 'idle' ||
        options.realtimeState.value === 'offline' ||
        options.realtimeState.value === 'error'
      ) {
        await refreshInvites(false)
      }
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const handleAccept = $(async (inviteId: string, userId: string) => {
    if (typeof window === 'undefined') return
    const key = `accept:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    const copyValue = options.fragmentCopy.value
    const resolveLocal = (value: string) => copyValue?.[value] ?? value

    try {
      const response = await fetch(
        buildApiUrl(`/chat/contacts/invites/${encodeURIComponent(inviteId)}/accept`, window.location.origin),
        { method: 'POST', credentials: 'include' }
      )

      if (!response.ok) {
        let errorMessage = resolveLocal('Invite unavailable.')
        try {
          const payload = (await response.json()) as { error?: string }
          if (payload?.error) errorMessage = payload.error
        } catch {
          // ignore parsing failures
        }
        options.statusTone.value = 'error'
        options.statusMessage.value = errorMessage
        return
      }

      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite accepted.')
      options.searchResults.value = options.searchResults.value.map((entry) =>
        entry.id === userId ? { ...entry, status: 'accepted', inviteId } : entry
      )
      if (
        options.realtimeState.value === 'idle' ||
        options.realtimeState.value === 'offline' ||
        options.realtimeState.value === 'error'
      ) {
        await refreshInvites(false)
      }
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const handleDecline = $(async (inviteId: string, userId: string) => {
    if (typeof window === 'undefined') return
    const key = `decline:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    const copyValue = options.fragmentCopy.value
    const resolveLocal = (value: string) => copyValue?.[value] ?? value

    try {
      const response = await fetch(
        buildApiUrl(`/chat/contacts/invites/${encodeURIComponent(inviteId)}/decline`, window.location.origin),
        { method: 'POST', credentials: 'include' }
      )

      if (!response.ok) {
        let errorMessage = resolveLocal('Invite unavailable.')
        try {
          const payload = (await response.json()) as { error?: string }
          if (payload?.error) errorMessage = payload.error
        } catch {
          // ignore parsing failures
        }
        options.statusTone.value = 'error'
        options.statusMessage.value = errorMessage
        return
      }

      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite declined.')
      options.searchResults.value = options.searchResults.value.map((entry) =>
        entry.id === userId ? { ...entry, status: 'none', inviteId: undefined } : entry
      )
      if (
        options.realtimeState.value === 'idle' ||
        options.realtimeState.value === 'offline' ||
        options.realtimeState.value === 'error'
      ) {
        await refreshInvites(false)
      }
    } catch (error) {
      options.statusTone.value = 'error'
      options.statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
    } finally {
      options.busyKeys.value = options.busyKeys.value.filter((entry) => entry !== key)
    }
  })

  const handleRemove = $(async (inviteId: string, userId: string, email: string) => {
    if (typeof window === 'undefined') return
    const key = `remove:${inviteId}`
    if (options.busyKeys.value.includes(key)) return

    options.busyKeys.value = [...options.busyKeys.value, key]
    options.statusMessage.value = null

    const copyValue = options.fragmentCopy.value
    const resolveLocal = (value: string) => copyValue?.[value] ?? value

    try {
      const response = await fetch(
        buildApiUrl(`/chat/contacts/invites/${encodeURIComponent(inviteId)}`, window.location.origin),
        { method: 'DELETE', credentials: 'include' }
      )

      if (!response.ok) {
        let errorMessage = resolveLocal('Invite unavailable.')
        try {
          const payload = (await response.json()) as { error?: string }
          if (payload?.error) errorMessage = payload.error
        } catch {
          // ignore parsing failures
        }
        options.statusTone.value = 'error'
        options.statusMessage.value = errorMessage
        return
      }

      options.statusTone.value = 'success'
      options.statusMessage.value = resolveLocal('Invite removed.')
      options.searchResults.value = options.searchResults.value.map((entry) =>
        entry.id === userId ? { ...entry, status: 'none', inviteId: undefined } : entry
      )
      if (!userId) {
        options.searchResults.value = options.searchResults.value.map((entry) =>
          entry.email === email ? { ...entry, status: 'none', inviteId: undefined } : entry
        )
      }
      if (
        options.realtimeState.value === 'idle' ||
        options.realtimeState.value === 'offline' ||
        options.realtimeState.value === 'error'
      ) {
        await refreshInvites(false)
      }
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
    isAlertCount,
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

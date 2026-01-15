import { useVisibleTask$, type NoSerialize, type QRL, type Signal } from '@builder.io/qwik'
import {
  buildChatSettingsKey,
  defaultChatSettings,
  loadChatSettings,
  parseChatSettings,
  type ChatSettings
} from '../../shared/chat-settings'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { resolveChatSettingsUserId } from './api'
import { countStorageKey } from './constants'
import { clearInvitesCache } from './invites-cache'
import { loadContactsMaps, mergeContactsPayload } from './contacts-crdt'
import { createLocalChatTransport } from './local-transport'
import type {
  ActiveContact,
  BaselineInviteCounts,
  ContactInviteView,
  ContactInvitesPayload,
  ContactSearchResult,
  DmOrigin,
  RealtimeState
} from './types'

type ContactInvitesShellOptions = {
  activeContact: Signal<ActiveContact | null>
  dmClosing: Signal<boolean>
  dmOrigin: Signal<DmOrigin | null>
  incoming: Signal<ContactInviteView[]>
  outgoing: Signal<ContactInviteView[]>
  contacts: Signal<ContactInviteView[]>
  onlineIds: Signal<string[]>
  baselineCounts: Signal<BaselineInviteCounts | null>
  invitesState: Signal<'idle' | 'loading' | 'error'>
  realtimeState: Signal<RealtimeState>
  searchResults: Signal<ContactSearchResult[]>
  wsRef: Signal<NoSerialize<WebSocket> | undefined>
  bellOpen: Signal<boolean>
  bellButtonRef: Signal<HTMLButtonElement | undefined>
  bellPopoverRef: Signal<HTMLDivElement | undefined>
  chatSettingsOpen: Signal<boolean>
  chatSettingsButtonRef: Signal<HTMLButtonElement | undefined>
  chatSettingsPopoverRef: Signal<HTMLDivElement | undefined>
  chatSettingsUserId: Signal<string | undefined>
  chatSettingsKey: Signal<string>
  chatSettings: Signal<ChatSettings>
  identityReady: Signal<boolean>
  registerIdentity: QRL<() => Promise<DeviceIdentity>>
  publishRelayIdentity: QRL<() => Promise<boolean>>
  refreshInvites: QRL<(resetStatus?: boolean) => Promise<void>>
  closeContact: QRL<() => void>
}

export const useContactInvitesShell = (options: ContactInvitesShellOptions) => {
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      let active = true
      let previousUserId = options.chatSettingsUserId.value
      const transport = createLocalChatTransport()
      let unsubscribeContacts: (() => void) | null = null

      if (!options.identityReady.value) {
        options.identityReady.value = true
        void options.registerIdentity()
      }
      void (async () => {
        const userId = await resolveChatSettingsUserId()
        if (previousUserId && previousUserId !== userId) {
          clearInvitesCache(previousUserId)
        }
        options.chatSettingsUserId.value = userId
        options.chatSettingsKey.value = buildChatSettingsKey(userId)
        options.chatSettings.value = loadChatSettings(userId)
        previousUserId = userId
        if (userId) {
          void options.publishRelayIdentity()
        }
      })()

      const handleDocumentClick = (event: MouseEvent) => {
        if (!options.bellOpen.value) return
        const target = event.target as Node | null
        const button = options.bellButtonRef.value
        const popover = options.bellPopoverRef.value
        if (button && target && button.contains(target)) return
        if (popover && target && popover.contains(target)) return
        options.bellOpen.value = false
      }

      const restoreSettingsFocus = () => {
        const popover = options.chatSettingsPopoverRef.value
        const active = document.activeElement
        if (!popover || !active || !popover.contains(active)) return
        options.chatSettingsButtonRef.value?.focus()
      }

      const handleSettingsClick = (event: MouseEvent) => {
        if (!options.chatSettingsOpen.value) return
        const target = event.target as Node | null
        const button = options.chatSettingsButtonRef.value
        const popover = options.chatSettingsPopoverRef.value
        if (button && target && button.contains(target)) return
        if (popover && target && popover.contains(target)) return
        restoreSettingsFocus()
        options.chatSettingsOpen.value = false
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          options.bellOpen.value = false
          restoreSettingsFocus()
          options.chatSettingsOpen.value = false
          void options.closeContact()
        }
      }

      const handleStorage = (event: StorageEvent) => {
        if (!event.key || event.key !== options.chatSettingsKey.value) return
        const parsed = parseChatSettings(event.newValue)
        options.chatSettings.value = parsed ? { ...defaultChatSettings, ...parsed } : { ...defaultChatSettings }
      }

      const readBaselineCounts = () => {
        try {
          const raw = window.localStorage.getItem(countStorageKey)
          if (!raw) return
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== 'object') return
          const next: BaselineInviteCounts = {
            incoming: Number.NaN,
            outgoing: Number.NaN,
            contacts: Number.NaN
          }
          let hasValue = false
          const incoming = Number((parsed as Record<string, unknown>).incoming)
          const outgoing = Number((parsed as Record<string, unknown>).outgoing)
          const contacts = Number((parsed as Record<string, unknown>).contacts)
          if (Number.isFinite(incoming)) {
            next.incoming = incoming
            hasValue = true
          }
          if (Number.isFinite(outgoing)) {
            next.outgoing = outgoing
            hasValue = true
          }
          if (Number.isFinite(contacts)) {
            next.contacts = contacts
            hasValue = true
          }
          options.baselineCounts.value = hasValue ? next : null
        } catch {
          // ignore storage failures
        }
      }

      const saveCounts = () => {
        const payload = {
          incoming: options.incoming.value.length,
          outgoing: options.outgoing.value.length,
          contacts: options.contacts.value.length
        }
        try {
          window.localStorage.setItem(countStorageKey, JSON.stringify(payload))
        } catch {
          // ignore storage failures
        }
      }

      const handleVisibility = () => {
        if (document.visibilityState === 'hidden') {
          saveCounts()
        }
      }

      readBaselineCounts()

      window.addEventListener('beforeunload', saveCounts)
      document.addEventListener('visibilitychange', handleVisibility)
      document.addEventListener('click', handleDocumentClick)
      document.addEventListener('click', handleSettingsClick)
      document.addEventListener('keydown', handleKeyDown)
      window.addEventListener('storage', handleStorage)

      const applySnapshot = async (payload: ContactInvitesPayload) => {
        const nextIncoming = Array.isArray(payload.incoming) ? payload.incoming : []
        const nextOutgoing = Array.isArray(payload.outgoing) ? payload.outgoing : []
        const nextContacts = Array.isArray(payload.contacts) ? payload.contacts : []
        const userId = options.chatSettingsUserId.value
        if (userId) {
          const maps = await loadContactsMaps(userId)
          if (maps) {
            maps.doc.transact(() => {
              mergeContactsPayload(
                maps.contacts,
                { incoming: nextIncoming, outgoing: nextOutgoing, contacts: nextContacts },
                'server'
              )
            })
          }
        }
        options.onlineIds.value = []
        options.invitesState.value = 'idle'
        options.realtimeState.value = 'live'
      }

      const syncContacts = async () => {
        const userId = options.chatSettingsUserId.value
        if (!userId) return
        if (unsubscribeContacts) {
          unsubscribeContacts()
          unsubscribeContacts = null
        }
        unsubscribeContacts = await transport.subscribeContacts(userId, (payload) => {
          void applySnapshot(payload)
        })
        options.realtimeState.value =
          typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'live'
      }

      void syncContacts()

      const handleOnline = () => {
        if (!active) return
        options.realtimeState.value = 'live'
      }

      const handleOffline = () => {
        if (!active) return
        options.realtimeState.value = 'offline'
      }

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)

      ctx.cleanup(() => {
        active = false
        if (unsubscribeContacts) unsubscribeContacts()
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        saveCounts()
        window.removeEventListener('beforeunload', saveCounts)
        document.removeEventListener('visibilitychange', handleVisibility)
        document.removeEventListener('click', handleDocumentClick)
        document.removeEventListener('click', handleSettingsClick)
        document.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('storage', handleStorage)
        options.wsRef.value = undefined
        options.realtimeState.value = 'idle'
      })
    },
    { strategy: 'document-ready' }
  )
}

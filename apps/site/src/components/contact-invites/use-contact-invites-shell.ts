import { noSerialize, useVisibleTask$, type NoSerialize, type QRL, type Signal } from '@builder.io/qwik'
import {
  buildChatSettingsKey,
  defaultChatSettings,
  loadChatSettings,
  parseChatSettings,
  type ChatSettings
} from '../../shared/chat-settings'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { buildWsUrl, resolveChatSettingsUserId } from './api'
import { countStorageKey } from './constants'
import type {
  ActiveContact,
  BaselineInviteCounts,
  ContactInviteView,
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
  refreshInvites: QRL<(resetStatus?: boolean) => Promise<void>>
  closeContact: QRL<() => void>
}

export const useContactInvitesShell = (options: ContactInvitesShellOptions) => {
  useVisibleTask$(
    (ctx) => {
      if (typeof window === 'undefined') return
      let active = true
      let hasSnapshot = false
      let reconnectTimer: number | null = null

      if (!options.identityReady.value) {
        options.identityReady.value = true
        void options.registerIdentity()
      }
      void (async () => {
        const userId = await resolveChatSettingsUserId()
        options.chatSettingsUserId.value = userId
        options.chatSettingsKey.value = buildChatSettingsKey(userId)
        options.chatSettings.value = loadChatSettings(userId)
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

      const handleSettingsClick = (event: MouseEvent) => {
        if (!options.chatSettingsOpen.value) return
        const target = event.target as Node | null
        const button = options.chatSettingsButtonRef.value
        const popover = options.chatSettingsPopoverRef.value
        if (button && target && button.contains(target)) return
        if (popover && target && popover.contains(target)) return
        options.chatSettingsOpen.value = false
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          options.bellOpen.value = false
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

      const applySnapshot = (payload: Record<string, unknown>) => {
        const nextIncoming = Array.isArray(payload.incoming) ? (payload.incoming as ContactInviteView[]) : []
        const nextOutgoing = Array.isArray(payload.outgoing) ? (payload.outgoing as ContactInviteView[]) : []
        const nextContacts = Array.isArray(payload.contacts) ? (payload.contacts as ContactInviteView[]) : []
        const nextOnline = Array.isArray(payload.onlineIds) ? payload.onlineIds.filter((id) => typeof id === 'string') : []
        options.incoming.value = nextIncoming
        options.outgoing.value = nextOutgoing
        options.contacts.value = nextContacts
        options.onlineIds.value = Array.from(new Set(nextOnline))
        if (options.activeContact.value) {
          const stillConnected = nextContacts.some((invite) => invite.user.id === options.activeContact.value?.id)
          if (!stillConnected) {
            options.activeContact.value = null
            options.dmClosing.value = false
            options.dmOrigin.value = null
          }
        }
        const baseline = options.baselineCounts.value
        if (!baseline) {
          options.baselineCounts.value = {
            incoming: nextIncoming.length,
            outgoing: nextOutgoing.length,
            contacts: nextContacts.length
          }
        } else {
          const next = { ...baseline }
          let changed = false
          if (!Number.isFinite(next.incoming)) {
            next.incoming = nextIncoming.length
            changed = true
          }
          if (!Number.isFinite(next.outgoing)) {
            next.outgoing = nextOutgoing.length
            changed = true
          }
          if (!Number.isFinite(next.contacts)) {
            next.contacts = nextContacts.length
            changed = true
          }
          if (changed) {
            options.baselineCounts.value = next
          }
        }
        options.invitesState.value = 'idle'
        options.realtimeState.value = 'live'
        hasSnapshot = true
        if (options.searchResults.value.length) {
          const statusByUser = new Map<string, { status: ContactSearchResult['status']; inviteId: string }>()
          nextIncoming.forEach((invite) =>
            statusByUser.set(invite.user.id, { status: 'incoming', inviteId: invite.id })
          )
          nextOutgoing.forEach((invite) =>
            statusByUser.set(invite.user.id, { status: 'outgoing', inviteId: invite.id })
          )
          nextContacts.forEach((invite) =>
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
      }

      const applyPresence = (userId: string, online: boolean) => {
        if (!userId) return
        const contactIds = new Set(options.contacts.value.map((invite) => invite.user.id))
        if (!contactIds.has(userId)) return
        const next = new Set(options.onlineIds.value)
        if (online) {
          next.add(userId)
        } else {
          next.delete(userId)
        }
        options.onlineIds.value = Array.from(next)
      }

      const scheduleReconnect = (delayMs = 4000) => {
        if (!active) return
        if (reconnectTimer !== null) return
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          connect()
        }, delayMs)
      }

      const connect = () => {
        if (!active) return
        const wsUrl = buildWsUrl('/chat/contacts/ws', window.location.origin)
        if (!wsUrl) {
          void options.refreshInvites()
          return
        }
        if (!hasSnapshot) {
          options.invitesState.value = 'loading'
        }
        options.realtimeState.value = 'connecting'
        options.wsRef.value?.close()
        const ws = new WebSocket(wsUrl)
        options.wsRef.value = noSerialize(ws)

        ws.addEventListener('message', (event) => {
          let payload: unknown
          try {
            payload = JSON.parse(String(event.data))
          } catch {
            return
          }
          if (!payload || typeof payload !== 'object') return
          const record = payload as Record<string, unknown>
          const type = record.type
          if (type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
            return
          }
          if (type === 'contacts:init' || type === 'contacts:update') {
            applySnapshot(record)
            return
          }
          if (type === 'contacts:presence') {
            const userId = typeof record.userId === 'string' ? record.userId : ''
            const online = typeof record.online === 'boolean' ? record.online : null
            if (online !== null) applyPresence(userId, online)
            return
          }
          if (type === 'error') {
            options.realtimeState.value = 'error'
            options.invitesState.value = 'error'
            if (!hasSnapshot) {
              void options.refreshInvites()
            }
            const retryAfter = Number(record.retryAfter)
            if (Number.isFinite(retryAfter) && retryAfter > 0) {
              scheduleReconnect(retryAfter * 1000)
            } else {
              scheduleReconnect()
            }
          }
        })

        ws.addEventListener('open', () => {
          options.realtimeState.value = 'connecting'
        })

        ws.addEventListener('close', () => {
          if (!active) return
          options.realtimeState.value = options.realtimeState.value === 'error' ? 'error' : 'offline'
          if (!hasSnapshot) {
            void options.refreshInvites()
          }
          scheduleReconnect()
        })

        ws.addEventListener('error', () => {
          options.realtimeState.value = 'error'
        })
      }

      connect()

      ctx.cleanup(() => {
        active = false
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer)
        }
        saveCounts()
        window.removeEventListener('beforeunload', saveCounts)
        document.removeEventListener('visibilitychange', handleVisibility)
        document.removeEventListener('click', handleDocumentClick)
        document.removeEventListener('click', handleSettingsClick)
        document.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('storage', handleStorage)
        options.wsRef.value?.close()
        options.realtimeState.value = 'idle'
      })
    },
    { strategy: 'document-ready' }
  )
}

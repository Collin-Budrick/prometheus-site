import { $, component$, noSerialize, useComputed$, useSignal, useVisibleTask$ } from '@builder.io/qwik'
import type { NoSerialize } from '@builder.io/qwik'
import { InBellNotification } from '@qwikest/icons/iconoir'
import { appConfig } from '../app-config'
import { getLanguagePack } from '../lang'
import { useSharedLangSignal } from '../shared/lang-bridge'
import {
  createStoredIdentity,
  decodeBase64,
  decryptPayload,
  deriveSessionKey,
  encryptPayload,
  importStoredIdentity,
  loadStoredIdentity,
  randomBase64,
  saveStoredIdentity,
  type DeviceIdentity,
  type EncryptedPayload
} from '../shared/p2p-crypto'

type ContactInvitesProps = {
  class?: string
  title?: string
  helper?: string
  searchLabel?: string
  searchPlaceholder?: string
  searchActionLabel?: string
  inviteActionLabel?: string
  acceptActionLabel?: string
  declineActionLabel?: string
  removeActionLabel?: string
  incomingLabel?: string
  outgoingLabel?: string
  contactsLabel?: string
  emptyLabel?: string
}

type ContactInviteView = {
  id: string
  status: string
  user: {
    id: string
    name?: string | null
    email: string
  }
}

type ContactInvitesPayload = {
  incoming?: ContactInviteView[]
  outgoing?: ContactInviteView[]
  contacts?: ContactInviteView[]
}

type ContactSearchResult = {
  id: string
  name?: string | null
  email: string
  status?: 'none' | 'incoming' | 'outgoing' | 'accepted'
  inviteId?: string
}

type ContactSearchPayload = {
  results?: ContactSearchResult[]
}

type RealtimeState = 'idle' | 'connecting' | 'live' | 'offline' | 'error'

const countStorageKey = 'contacts:panels:counts'

type BaselineInviteCounts = {
  incoming: number
  outgoing: number
  contacts: number
}

type ActiveContact = {
  id: string
  name?: string | null
  email: string
  online: boolean
}

type DmOrigin = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  radius: number
}

type ContactSearchItem = {
  id: string
  name?: string | null
  email: string
  status?: ContactSearchResult['status']
  inviteId?: string
  isContact: boolean
  online?: boolean
}

type DmConnectionState = 'idle' | 'connecting' | 'connected' | 'offline' | 'error'

type DmMessage = {
  id: string
  text: string
  author: 'self' | 'contact'
  createdAt: string
  status?: 'pending' | 'sent' | 'failed' | 'queued'
}

type ContactDevice = {
  deviceId: string
  publicKey: JsonWebKey
  label?: string
  role?: 'device' | 'relay'
  updatedAt?: string
}

type P2pSession = {
  sessionId: string
  salt: string
  key: CryptoKey
  remoteDeviceId: string
}

const buildApiUrl = (path: string, origin: string) => {
  const base = appConfig.apiBase
  if (!base) return `${origin}${path}`
  if (base.startsWith('/')) return `${origin}${base}${path}`
  return `${base}${path}`
}

const buildWsUrl = (path: string, origin: string) => {
  const httpUrl = buildApiUrl(path, origin)
  if (!httpUrl) return ''
  const url = new URL(httpUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const dmCloseDelayMs = 220
const dmOriginRadius = 16
const dmMinScale = 0.02
const historyStoragePrefix = 'chat:p2p:history:'
const historyCacheLimit = 200
const historyRequestLimit = 120

const normalizeLabel = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

const normalizeQuery = (value: string) => value.trim().toLowerCase()

const matchesQuery = (entry: { name?: string | null; email: string }, query: string) => {
  if (!query) return false
  const emailMatch = entry.email.toLowerCase().includes(query)
  const nameMatch = entry.name?.toLowerCase().includes(query) ?? false
  return emailMatch || nameMatch
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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

const mergeHistoryMessages = (existing: DmMessage[], incoming: DmMessage[]) => {
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

const loadHistory = async (contactId: string, identity: DeviceIdentity) => {
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

const persistHistory = async (contactId: string, identity: DeviceIdentity, messages: DmMessage[]) => {
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

const resolveEncryptedPayload = (payload: unknown): EncryptedPayload | null => {
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

const pickPreferredDevice = (devices: ContactDevice[]) =>
  devices.find((device) => device.role !== 'relay') ?? devices[0] ?? null

const createMessageId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const formatMessageTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatDisplayName = (entry: { name?: string | null; email: string }) => {
  const trimmed = entry.name?.trim() ?? ''
  return trimmed === '' ? entry.email : trimmed
}

export const ContactInvites = component$<ContactInvitesProps>(
  ({
    class: className,
    title,
    helper,
    searchLabel,
    searchPlaceholder,
    searchActionLabel,
    inviteActionLabel,
    acceptActionLabel,
    declineActionLabel,
    removeActionLabel,
    incomingLabel,
    outgoingLabel,
    contactsLabel,
    emptyLabel
  }) => {
    const langSignal = useSharedLangSignal()
    const searchQuery = useSignal('')
    const searchResults = useSignal<ContactSearchResult[]>([])
    const searchState = useSignal<'idle' | 'loading' | 'error'>('idle')
    const searchError = useSignal<string | null>(null)
    const invitesState = useSignal<'idle' | 'loading' | 'error'>('loading')
    const incoming = useSignal<ContactInviteView[]>([])
    const outgoing = useSignal<ContactInviteView[]>([])
    const contacts = useSignal<ContactInviteView[]>([])
    const onlineIds = useSignal<string[]>([])
    const statusMessage = useSignal<string | null>(null)
    const statusTone = useSignal<'neutral' | 'success' | 'error'>('neutral')
    const busyKeys = useSignal<string[]>([])
    const realtimeState = useSignal<RealtimeState>('idle')
    const wsRef = useSignal<NoSerialize<WebSocket> | undefined>(undefined)
    const baselineCounts = useSignal<BaselineInviteCounts | null>(null)
    const activeContact = useSignal<ActiveContact | null>(null)
    const dmClosing = useSignal(false)
    const dmOrigin = useSignal<DmOrigin | null>(null)
    const dmAnimated = useSignal(false)
    const dmMessages = useSignal<DmMessage[]>([])
    const dmInput = useSignal('')
    const dmStatus = useSignal<DmConnectionState>('idle')
    const dmError = useSignal<string | null>(null)
    const channelRef = useSignal<NoSerialize<RTCDataChannel> | undefined>(undefined)
    const identityRef = useSignal<NoSerialize<DeviceIdentity> | undefined>(undefined)
    const sessionRef = useSignal<NoSerialize<P2pSession> | undefined>(undefined)
    const remoteDeviceRef = useSignal<NoSerialize<ContactDevice> | undefined>(undefined)
    const identityReady = useSignal(false)
    const bellOpen = useSignal(false)
    const bellButtonRef = useSignal<HTMLButtonElement>()
    const bellPopoverRef = useSignal<HTMLDivElement>()

    const fragmentCopy = useComputed$(() => getLanguagePack(langSignal.value).fragments ?? {})
    const resolve = (value: string) => fragmentCopy.value?.[value] ?? value
    const rootClass = className
      ? className.includes('chat-invites')
        ? className
        : `chat-invites ${className}`.trim()
      : 'chat-invites'

    const resolvedTitle = normalizeLabel(title ? resolve(title) : undefined, resolve('Contact invites'))
    const resolvedHelper = normalizeLabel(helper ? resolve(helper) : undefined, resolve('Search by email to connect.'))
    const resolvedSearchLabel = normalizeLabel(searchLabel ? resolve(searchLabel) : undefined, resolve('Search by email'))
    const resolvedSearchPlaceholder = normalizeLabel(
      searchPlaceholder ? resolve(searchPlaceholder) : undefined,
      resolve('name@domain.com')
    )
    const resolvedSearchAction = normalizeLabel(
      searchActionLabel ? resolve(searchActionLabel) : undefined,
      resolve('Search')
    )
    const resolvedInviteAction = normalizeLabel(
      inviteActionLabel ? resolve(inviteActionLabel) : undefined,
      resolve('Invite')
    )
    const resolvedAcceptAction = normalizeLabel(
      acceptActionLabel ? resolve(acceptActionLabel) : undefined,
      resolve('Accept')
    )
    const resolvedDeclineAction = normalizeLabel(
      declineActionLabel ? resolve(declineActionLabel) : undefined,
      resolve('Decline')
    )
    const resolvedRemoveAction = normalizeLabel(
      removeActionLabel ? resolve(removeActionLabel) : undefined,
      resolve('Remove')
    )
    const resolvedIncomingLabel = normalizeLabel(
      incomingLabel ? resolve(incomingLabel) : undefined,
      resolve('Incoming')
    )
    const resolvedOutgoingLabel = normalizeLabel(
      outgoingLabel ? resolve(outgoingLabel) : undefined,
      resolve('Outgoing')
    )
    const resolvedContactsLabel = normalizeLabel(
      contactsLabel ? resolve(contactsLabel) : undefined,
      resolve('Contacts')
    )
    const resolvedEmptyLabel = normalizeLabel(
      emptyLabel ? resolve(emptyLabel) : undefined,
      resolve('No invites yet.')
    )

    const registerIdentity = $(async () => {
      let stored = loadStoredIdentity()
      if (!stored) {
        stored = await createStoredIdentity()
        saveStoredIdentity(stored)
      }
      let identity = await importStoredIdentity(stored)
      try {
        const label = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 64) : 'browser'
        const response = await fetch(buildApiUrl('/chat/p2p/device', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deviceId: identity.deviceId, publicKey: identity.publicKeyJwk, label })
        })
        if (response.ok) {
          const payload = (await response.json()) as { deviceId?: string }
          if (payload.deviceId && payload.deviceId !== identity.deviceId) {
            stored = { ...stored, deviceId: payload.deviceId }
            saveStoredIdentity(stored)
            identity = await importStoredIdentity(stored)
          }
        }
      } catch {
        // ignore registration failures; retry later
      }
      identityRef.value = noSerialize(identity)
      return identity
    })

    const isAlertCount = (key: keyof BaselineInviteCounts, value: number) => {
      const baseline = baselineCounts.value
      if (!baseline) return false
      const previous = baseline[key]
      if (!Number.isFinite(previous)) return false
      return value > previous
    }

    const refreshInvites = $(async (resetStatus = true) => {
      if (typeof window === 'undefined') return
      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      invitesState.value = 'loading'
      if (resetStatus) {
        statusMessage.value = null
        statusTone.value = 'neutral'
      }
      searchError.value = null

      try {
        const response = await fetch(buildApiUrl('/chat/contacts/invites', window.location.origin), {
          credentials: 'include'
        })

        if (!response.ok) {
          invitesState.value = 'error'
          statusTone.value = 'error'
          statusMessage.value = resolveLocal('Unable to load invites.')
          return
        }

        const payload = (await response.json()) as ContactInvitesPayload
        incoming.value = Array.isArray(payload.incoming) ? payload.incoming : []
        outgoing.value = Array.isArray(payload.outgoing) ? payload.outgoing : []
        contacts.value = Array.isArray(payload.contacts) ? payload.contacts : []
        onlineIds.value = []
        if (activeContact.value) {
          const stillConnected = contacts.value.some((invite) => invite.user.id === activeContact.value?.id)
          if (!stillConnected) {
            activeContact.value = null
            dmClosing.value = false
            dmOrigin.value = null
          }
        }
        if (searchResults.value.length) {
          const statusByUser = new Map<string, { status: ContactSearchResult['status']; inviteId: string }>()
          incoming.value.forEach((invite) => statusByUser.set(invite.user.id, { status: 'incoming', inviteId: invite.id }))
          outgoing.value.forEach((invite) => statusByUser.set(invite.user.id, { status: 'outgoing', inviteId: invite.id }))
          contacts.value.forEach((invite) => statusByUser.set(invite.user.id, { status: 'accepted', inviteId: invite.id }))
          searchResults.value = searchResults.value.map((entry) => {
            const status = statusByUser.get(entry.id)
            if (!status) {
              return { ...entry, status: 'none', inviteId: undefined }
            }
            return { ...entry, status: status.status, inviteId: status.inviteId }
          })
        }
        const baseline = baselineCounts.value
        if (!baseline) {
          baselineCounts.value = {
            incoming: incoming.value.length,
            outgoing: outgoing.value.length,
            contacts: contacts.value.length
          }
        } else {
          const next = { ...baseline }
          let changed = false
          if (!Number.isFinite(next.incoming)) {
            next.incoming = incoming.value.length
            changed = true
          }
          if (!Number.isFinite(next.outgoing)) {
            next.outgoing = outgoing.value.length
            changed = true
          }
          if (!Number.isFinite(next.contacts)) {
            next.contacts = contacts.value.length
            changed = true
          }
          if (changed) {
            baselineCounts.value = next
          }
        }
        invitesState.value = 'idle'
      } catch (error) {
        invitesState.value = 'error'
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Unable to load invites.')
      }
    })

    const handleSearchInput = $((event: Event) => {
      const value = (event.target as HTMLInputElement).value
      searchQuery.value = value
      searchResults.value = []
      searchState.value = 'idle'
      searchError.value = null
    })

    const handleSearchSubmit = $(async () => {
      if (typeof window === 'undefined') return
      const trimmed = searchQuery.value.trim()
      if (!trimmed) {
        searchResults.value = []
        searchState.value = 'idle'
        searchError.value = null
        return
      }

      const normalized = trimmed.toLowerCase()
      const contactMatches = contacts.value.filter((invite) => {
        const emailMatch = invite.user.email.toLowerCase().includes(normalized)
        const nameMatch = invite.user.name?.toLowerCase().includes(normalized) ?? false
        return emailMatch || nameMatch
      })
      if (contactMatches.length > 0) {
        searchResults.value = []
        searchState.value = 'idle'
        searchError.value = null
        return
      }

      const copyValue = fragmentCopy.value
      const resolveLocal = (value: string) => copyValue?.[value] ?? value

      searchState.value = 'loading'
      searchError.value = null

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
          searchState.value = 'error'
          searchError.value = errorMessage
          return
        }

        const payload = (await response.json()) as ContactSearchPayload
        const contactIds = new Set(contacts.value.map((invite) => invite.user.id))
        const results = Array.isArray(payload.results) ? payload.results : []
        searchResults.value = results.filter((result) => !contactIds.has(result.id))
        searchState.value = 'idle'
      } catch (error) {
        searchState.value = 'error'
        searchError.value = error instanceof Error ? error.message : resolveLocal('Unable to search.')
      }
    })

    const handleInvite = $(async (email: string, userId?: string) => {
      if (typeof window === 'undefined') return
      const key = `invite:${email}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
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
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        const payload = (await response.json()) as { id?: string; status?: string }
        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite sent.')
        if (userId) {
          searchResults.value = searchResults.value.map((entry) =>
            entry.id === userId
              ? { ...entry, status: 'outgoing', inviteId: payload.id ?? entry.inviteId }
              : entry
          )
        }
        if (
          realtimeState.value === 'idle' ||
          realtimeState.value === 'offline' ||
          realtimeState.value === 'error'
        ) {
          await refreshInvites(false)
        }
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    const handleAccept = $(async (inviteId: string, userId: string) => {
      if (typeof window === 'undefined') return
      const key = `accept:${inviteId}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
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
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite accepted.')
        searchResults.value = searchResults.value.map((entry) =>
          entry.id === userId ? { ...entry, status: 'accepted', inviteId } : entry
        )
        if (
          realtimeState.value === 'idle' ||
          realtimeState.value === 'offline' ||
          realtimeState.value === 'error'
        ) {
          await refreshInvites(false)
        }
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    const handleDecline = $(async (inviteId: string, userId: string) => {
      if (typeof window === 'undefined') return
      const key = `decline:${inviteId}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
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
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite declined.')
        searchResults.value = searchResults.value.map((entry) =>
          entry.id === userId ? { ...entry, status: 'none', inviteId: undefined } : entry
        )
        if (
          realtimeState.value === 'idle' ||
          realtimeState.value === 'offline' ||
          realtimeState.value === 'error'
        ) {
          await refreshInvites(false)
        }
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    const handleRemove = $(async (inviteId: string, userId: string, email: string) => {
      if (typeof window === 'undefined') return
      const key = `remove:${inviteId}`
      if (busyKeys.value.includes(key)) return

      busyKeys.value = [...busyKeys.value, key]
      statusMessage.value = null

      const copyValue = fragmentCopy.value
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
          statusTone.value = 'error'
          statusMessage.value = errorMessage
          return
        }

        statusTone.value = 'success'
        statusMessage.value = resolveLocal('Invite removed.')
        searchResults.value = searchResults.value.map((entry) =>
          entry.id === userId ? { ...entry, status: 'none', inviteId: undefined } : entry
        )
        if (!userId) {
          searchResults.value = searchResults.value.map((entry) =>
            entry.email === email ? { ...entry, status: 'none', inviteId: undefined } : entry
          )
        }
        if (
          realtimeState.value === 'idle' ||
          realtimeState.value === 'offline' ||
          realtimeState.value === 'error'
        ) {
          await refreshInvites(false)
        }
      } catch (error) {
        statusTone.value = 'error'
        statusMessage.value = error instanceof Error ? error.message : resolveLocal('Invite unavailable.')
      } finally {
        busyKeys.value = busyKeys.value.filter((entry) => entry !== key)
      }
    })

    const toggleBell = $(() => {
      bellOpen.value = !bellOpen.value
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
        dmOrigin.value = {
          x: rect.left,
          y: rect.top,
          scaleX: Math.min(Math.max(scaleX, dmMinScale), 1),
          scaleY: Math.min(Math.max(scaleY, dmMinScale), 1),
          radius: dmOriginRadius
        }
      } else {
        dmOrigin.value = null
      }
      dmClosing.value = false
      dmAnimated.value = false
      activeContact.value = {
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
        dmOrigin.value = {
          x: rect.left,
          y: rect.top,
          scaleX: Math.min(Math.max(scaleX, dmMinScale), 1),
          scaleY: Math.min(Math.max(scaleY, dmMinScale), 1),
          radius: dmOriginRadius
        }
      } else {
        dmOrigin.value = null
      }
      dmClosing.value = false
      dmAnimated.value = false
      activeContact.value = {
        id: contact.id,
        name: contact.name ?? null,
        email: contact.email,
        online: !!contact.online
      }
    })

    const closeContact = $(() => {
      if (!activeContact.value || dmClosing.value) return
      dmClosing.value = true
      if (typeof window === 'undefined') {
        activeContact.value = null
        dmClosing.value = false
        dmAnimated.value = false
        dmOrigin.value = null
        return
      }
      window.setTimeout(() => {
        activeContact.value = null
        dmClosing.value = false
        dmAnimated.value = false
        dmOrigin.value = null
      }, dmCloseDelayMs)
    })

    const handleDmInput = $((event: Event) => {
      const target = event.target as HTMLInputElement | null
      dmInput.value = target?.value ?? ''
    })

    const handleDmSubmit = $(async () => {
      if (typeof window === 'undefined') return
      const contact = activeContact.value
      const text = dmInput.value.trim()
      if (!contact || !text) return
      const messageId = createMessageId()
      const createdAt = new Date().toISOString()
      const identity = identityRef.value

      dmInput.value = ''
      dmError.value = null
      dmMessages.value = [
        ...dmMessages.value,
        { id: messageId, text, author: 'self', createdAt, status: 'pending' }
      ]
      if (identity) {
        void persistHistory(contact.id, identity, dmMessages.value)
      }

      try {
        const channel = channelRef.value
        const session = sessionRef.value
        if (channel && channel.readyState === 'open' && session && identity) {
          const payload = await encryptPayload(
            session.key,
            JSON.stringify({ kind: 'message', id: messageId, text, createdAt }),
            session.sessionId,
            session.salt,
            identity.deviceId
          )
          channel.send(JSON.stringify({ type: 'message', payload }))
          dmMessages.value = dmMessages.value.map((message) =>
            message.id === messageId ? { ...message, status: 'sent' } : message
          )
          void persistHistory(contact.id, identity, dmMessages.value)
          return
        }

        const remoteDevice = remoteDeviceRef.value
        if (!identity || !remoteDevice) {
          dmMessages.value = dmMessages.value.map((message) =>
            message.id === messageId ? { ...message, status: 'failed' } : message
          )
          dmError.value = fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
          if (identity) {
            void persistHistory(contact.id, identity, dmMessages.value)
          }
          return
        }

        const sessionId = createMessageId()
        const salt = randomBase64(16)
        const key = await deriveSessionKey(
          identity.privateKey,
          remoteDevice.publicKey,
          decodeBase64(salt),
          sessionId
        )
        const payload = await encryptPayload(
          key,
          JSON.stringify({ kind: 'message', id: messageId, text, createdAt }),
          sessionId,
          salt,
          identity.deviceId
        )
        const response = await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ recipientId: contact.id, messageId, sessionId, payload })
        })

        dmMessages.value = dmMessages.value.map((message) =>
          message.id === messageId ? { ...message, status: response.ok ? 'queued' : 'failed' } : message
        )
        void persistHistory(contact.id, identity, dmMessages.value)
        if (!response.ok) {
          let errorMessage = fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
          try {
            const payload: unknown = await response.json()
            if (isRecord(payload) && typeof payload.error === 'string') {
              errorMessage = payload.error
            }
          } catch {
            // ignore parse errors
          }
          dmError.value = errorMessage
        }
      } catch (error) {
        dmMessages.value = dmMessages.value.map((message) =>
          message.id === messageId ? { ...message, status: 'failed' } : message
        )
        if (identity) {
          void persistHistory(contact.id, identity, dmMessages.value)
        }
        dmError.value =
          error instanceof Error
            ? error.message
            : fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
      }
    })

    useVisibleTask$(
      (ctx) => {
        if (typeof window === 'undefined') return
        let active = true
        let hasSnapshot = false
        let reconnectTimer: number | null = null

        if (!identityReady.value) {
          identityReady.value = true
          void registerIdentity()
        }

        const handleDocumentClick = (event: MouseEvent) => {
          if (!bellOpen.value) return
          const target = event.target as Node | null
          const button = bellButtonRef.value
          const popover = bellPopoverRef.value
          if (button && target && button.contains(target)) return
          if (popover && target && popover.contains(target)) return
          bellOpen.value = false
        }

        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            bellOpen.value = false
            void closeContact()
          }
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
            baselineCounts.value = hasValue ? next : null
          } catch {
            // ignore storage failures
          }
        }

        const saveCounts = () => {
          const payload = {
            incoming: incoming.value.length,
            outgoing: outgoing.value.length,
            contacts: contacts.value.length
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
        document.addEventListener('keydown', handleKeyDown)

        const applySnapshot = (payload: Record<string, unknown>) => {
          const nextIncoming = Array.isArray(payload.incoming) ? (payload.incoming as ContactInviteView[]) : []
          const nextOutgoing = Array.isArray(payload.outgoing) ? (payload.outgoing as ContactInviteView[]) : []
          const nextContacts = Array.isArray(payload.contacts) ? (payload.contacts as ContactInviteView[]) : []
          const nextOnline = Array.isArray(payload.onlineIds) ? payload.onlineIds.filter((id) => typeof id === 'string') : []
          incoming.value = nextIncoming
          outgoing.value = nextOutgoing
          contacts.value = nextContacts
          onlineIds.value = Array.from(new Set(nextOnline))
          if (activeContact.value) {
            const stillConnected = nextContacts.some((invite) => invite.user.id === activeContact.value?.id)
            if (!stillConnected) {
              activeContact.value = null
              dmClosing.value = false
              dmOrigin.value = null
            }
          }
          const baseline = baselineCounts.value
          if (!baseline) {
            baselineCounts.value = {
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
              baselineCounts.value = next
            }
          }
          invitesState.value = 'idle'
          realtimeState.value = 'live'
          hasSnapshot = true
          if (searchResults.value.length) {
            const statusByUser = new Map<string, { status: ContactSearchResult['status']; inviteId: string }>()
            nextIncoming.forEach((invite) => statusByUser.set(invite.user.id, { status: 'incoming', inviteId: invite.id }))
            nextOutgoing.forEach((invite) => statusByUser.set(invite.user.id, { status: 'outgoing', inviteId: invite.id }))
            nextContacts.forEach((invite) => statusByUser.set(invite.user.id, { status: 'accepted', inviteId: invite.id }))
            searchResults.value = searchResults.value.map((entry) => {
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
          const contactIds = new Set(contacts.value.map((invite) => invite.user.id))
          if (!contactIds.has(userId)) return
          const next = new Set(onlineIds.value)
          if (online) {
            next.add(userId)
          } else {
            next.delete(userId)
          }
          onlineIds.value = Array.from(next)
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
            void refreshInvites()
            return
          }
          if (!hasSnapshot) {
            invitesState.value = 'loading'
          }
          realtimeState.value = 'connecting'
          wsRef.value?.close()
          const ws = new WebSocket(wsUrl)
          wsRef.value = noSerialize(ws)

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
              realtimeState.value = 'error'
              invitesState.value = 'error'
              if (!hasSnapshot) {
                void refreshInvites()
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
            realtimeState.value = 'connecting'
          })

          ws.addEventListener('close', () => {
            if (!active) return
            realtimeState.value = realtimeState.value === 'error' ? 'error' : 'offline'
            if (!hasSnapshot) {
              void refreshInvites()
            }
            scheduleReconnect()
          })

          ws.addEventListener('error', () => {
            realtimeState.value = 'error'
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
          document.removeEventListener('keydown', handleKeyDown)
          wsRef.value?.close()
          realtimeState.value = 'idle'
        })
      },
      { strategy: 'document-ready' }
    )

    useVisibleTask$((ctx) => {
      const contact = ctx.track(() => activeContact.value)
      if (typeof window === 'undefined') return

      if (!contact) {
        dmStatus.value = 'idle'
        dmMessages.value = []
        dmInput.value = ''
        dmError.value = null
        sessionRef.value = undefined
        remoteDeviceRef.value = undefined
        return
      }

      let active = true
      let devices: ContactDevice[] = []
      let connection: RTCPeerConnection | null = null
      let channel: RTCDataChannel | null = null
      let ws: WebSocket | null = null
      let reconnectTimer: number | null = null
      let historyRequested = false
      let historyNeeded = false
      const pendingSignals: Array<Record<string, unknown>> = []

      dmStatus.value = 'connecting'
      dmMessages.value = []
      dmInput.value = ''
      dmError.value = null
      sessionRef.value = undefined

      const closeConnection = () => {
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        pendingSignals.splice(0, pendingSignals.length)
        if (channel) {
          channel.close()
          channel = null
        }
        if (connection) {
          connection.close()
          connection = null
        }
        ws?.close()
        ws = null
        channelRef.value = undefined
      }

      const fetchDevices = async () => {
        try {
          const response = await fetch(
            buildApiUrl(`/chat/p2p/devices/${encodeURIComponent(contact.id)}`, window.location.origin),
            { credentials: 'include' }
          )
          if (!response.ok) return []
          const payload = (await response.json()) as { devices?: ContactDevice[] }
          const next = Array.isArray(payload.devices) ? payload.devices.filter((device) => device.deviceId) : []
          devices = next
          return next
        } catch {
          return []
        }
      }

      const resolveDevice = async (deviceId: string) => {
        let device = devices.find((entry) => entry.deviceId === deviceId)
        if (device) return device
        await fetchDevices()
        device = devices.find((entry) => entry.deviceId === deviceId)
        return device ?? null
      }

      const sendSignal = (signal: Record<string, unknown>) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(signal))
          return
        }
        pendingSignals.push(signal)
      }

      const applyConnectionState = () => {
        if (!connection) return
        const state = connection.connectionState
        if (state === 'connected') {
          dmStatus.value = 'connected'
          return
        }
        if (state === 'failed' || state === 'disconnected') {
          dmStatus.value = 'offline'
        }
      }

      const setupChannel = (next: RTCDataChannel) => {
        channel = next
        channelRef.value = noSerialize(next)
        next.onopen = () => {
          dmStatus.value = 'connected'
        }
        next.onclose = () => {
          dmStatus.value = 'offline'
        }
        next.onerror = () => {
          dmStatus.value = 'error'
        }
        next.onmessage = async (event) => {
          try {
            const raw = String(event.data ?? '')
            let parsed: unknown
            try {
              parsed = JSON.parse(raw)
            } catch {
              return
            }
            if (!isRecord(parsed) || parsed.type !== 'message') return
            const encrypted = resolveEncryptedPayload(parsed.payload)
            if (!encrypted) return
            const senderDeviceId = typeof encrypted.senderDeviceId === 'string' ? encrypted.senderDeviceId : undefined
            const identity = identityRef.value
            if (!identity) return
            const deviceId = senderDeviceId ?? sessionRef.value?.remoteDeviceId ?? remoteDeviceRef.value?.deviceId
            if (!deviceId) return
            const device = await resolveDevice(deviceId)
            if (!device) return
            remoteDeviceRef.value = noSerialize(device)
            const key = await deriveSessionKey(
              identity.privateKey,
              device.publicKey,
              decodeBase64(encrypted.salt),
              encrypted.sessionId
            )
            sessionRef.value = noSerialize({
              sessionId: encrypted.sessionId,
              salt: encrypted.salt,
              key,
              remoteDeviceId: device.deviceId
            })
            const plaintext = await decryptPayload(key, encrypted)
            let messageText = plaintext
            let messageId = createMessageId()
            let createdAt = new Date().toISOString()
            let isReceipt = false
            let receiptTargetId: string | null = null
            let isHistoryRequest = false
            let historyLimit = historyRequestLimit
            let historyResponse: DmMessage[] | null = null
            try {
              const messagePayload = JSON.parse(plaintext) as {
                kind?: string
                id?: string
                text?: string
                createdAt?: string
                limit?: number
                messages?: Array<Record<string, unknown>>
              }
              if (messagePayload?.kind === 'receipt') {
                isReceipt = true
                if (typeof messagePayload.id === 'string') {
                  receiptTargetId = messagePayload.id
                }
              } else if (messagePayload?.kind === 'history-request') {
                isHistoryRequest = true
                if (Number.isFinite(Number(messagePayload.limit))) {
                  historyLimit = Math.max(1, Math.min(historyCacheLimit, Number(messagePayload.limit)))
                }
              } else if (messagePayload?.kind === 'history-response') {
                const historyEntries = Array.isArray(messagePayload.messages) ? messagePayload.messages : []
                const mapped: DmMessage[] = []
                for (const entry of historyEntries) {
                  if (!isRecord(entry)) continue
                  const id = typeof entry.id === 'string' ? entry.id : ''
                  const text = typeof entry.text === 'string' ? entry.text : ''
                  const created = typeof entry.createdAt === 'string' ? entry.createdAt : ''
                  const author =
                    entry.author === 'self' ? 'contact' : entry.author === 'contact' ? 'self' : null
                  if (!id || !text || !created || !author) continue
                  mapped.push({ id, text, createdAt: created, author, status: 'sent' })
                }
                historyResponse = mapped
              } else {
                if (typeof messagePayload?.text === 'string') messageText = messagePayload.text
                if (typeof messagePayload?.id === 'string') messageId = messagePayload.id
                if (typeof messagePayload?.createdAt === 'string') createdAt = messagePayload.createdAt
                if (typeof messagePayload?.id === 'string') {
                  receiptTargetId = messagePayload.id
                }
              }
            } catch {
              // ignore parse errors
            }
            if (isReceipt) {
              if (receiptTargetId) {
                dmMessages.value = dmMessages.value.map((message) =>
                  message.id === receiptTargetId ? { ...message, status: 'sent' } : message
                )
                void persistHistory(contact.id, identity, dmMessages.value)
              }
              return
            }
            if (historyResponse) {
              dmMessages.value = mergeHistoryMessages(dmMessages.value, historyResponse)
              void persistHistory(contact.id, identity, dmMessages.value)
              return
            }
            if (isHistoryRequest) {
              let snapshot = dmMessages.value
              if (!snapshot.length) {
                snapshot = await loadHistory(contact.id, identity)
              }
              if (!snapshot.length) return
              const trimmed = snapshot
                .slice(-historyLimit)
                .map((message) => ({
                  id: message.id,
                  text: message.text,
                  createdAt: message.createdAt,
                  author: message.author
                }))
              try {
                const responsePayload = await encryptPayload(
                  key,
                  JSON.stringify({ kind: 'history-response', messages: trimmed }),
                  encrypted.sessionId,
                  encrypted.salt,
                  identity.deviceId
                )
                if (next.readyState === 'open') {
                  next.send(JSON.stringify({ type: 'message', payload: responsePayload }))
                }
              } catch {
                // ignore history response failures
              }
              return
            }
            dmMessages.value = [
              ...dmMessages.value,
              { id: messageId, text: messageText, author: 'contact', createdAt, status: 'sent' }
            ]
            void persistHistory(contact.id, identity, dmMessages.value)
            if (receiptTargetId) {
              try {
                const receipt = await encryptPayload(
                  key,
                  JSON.stringify({ kind: 'receipt', id: receiptTargetId }),
                  encrypted.sessionId,
                  encrypted.salt,
                  identity.deviceId
                )
                if (next.readyState === 'open') {
                  next.send(JSON.stringify({ type: 'message', payload: receipt }))
                }
              } catch {
                // ignore receipt failures
              }
            }
          } catch (error) {
            dmStatus.value = 'error'
            dmError.value = error instanceof Error ? error.message : 'Unable to decrypt message.'
          }
        }
      }

      const requestHistory = async (identity: DeviceIdentity) => {
        if (historyRequested || !historyNeeded) return
        historyRequested = true
        const session = sessionRef.value
        const payload = { kind: 'history-request', limit: historyRequestLimit }
        if (channel && channel.readyState === 'open' && session) {
          try {
            const encrypted = await encryptPayload(
              session.key,
              JSON.stringify(payload),
              session.sessionId,
              session.salt,
              identity.deviceId
            )
            channel.send(JSON.stringify({ type: 'message', payload: encrypted }))
          } catch {
            // ignore history request failures
          }
          return
        }
        const remoteDevice = remoteDeviceRef.value
        if (!remoteDevice) return
        try {
          const sessionId = createMessageId()
          const salt = randomBase64(16)
          const key = await deriveSessionKey(
            identity.privateKey,
            remoteDevice.publicKey,
            decodeBase64(salt),
            sessionId
          )
          const encrypted = await encryptPayload(
            key,
            JSON.stringify(payload),
            sessionId,
            salt,
            identity.deviceId
          )
          await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ recipientId: contact.id, sessionId, payload: encrypted })
          })
        } catch {
          // ignore history request failures
        }
      }

      const ensurePeerConnection = (identity: DeviceIdentity, remoteDevice: ContactDevice) => {
        if (connection) return
        connection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        })
        connection.onicecandidate = (event) => {
          if (!event.candidate) return
          const session = sessionRef.value
          const payload = {
            type: 'candidate',
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
          }
          const signal = {
            type: 'signal',
            to: contact.id,
            toDeviceId: remoteDevice.deviceId,
            sessionId: session?.sessionId,
            payload
          }
          sendSignal(signal)
        }
        connection.onconnectionstatechange = applyConnectionState
        connection.ondatachannel = (event) => {
          setupChannel(event.channel)
        }
      }

      const handleSignal = async (signal: Record<string, unknown>) => {
        const payload = isRecord(signal.payload) ? signal.payload : null
        if (!payload) return
        const payloadType = payload.type
        if (payloadType !== 'offer' && payloadType !== 'answer' && payloadType !== 'candidate') return
        const identity = identityRef.value
        if (!identity) return
        const fromDeviceId = typeof signal.fromDeviceId === 'string' ? signal.fromDeviceId : undefined
        const sessionId = typeof signal.sessionId === 'string' ? signal.sessionId : undefined
        const salt = typeof payload.salt === 'string' ? payload.salt : undefined
        const remoteDevice = fromDeviceId ? await resolveDevice(fromDeviceId) : remoteDeviceRef.value ?? null
        if (!remoteDevice) return
        remoteDeviceRef.value = noSerialize(remoteDevice)
        ensurePeerConnection(identity, remoteDevice)
        if (!connection) return

        if (payloadType === 'offer' && typeof payload.sdp === 'string' && sessionId && salt) {
          const key = await deriveSessionKey(
            identity.privateKey,
            remoteDevice.publicKey,
            decodeBase64(salt),
            sessionId
          )
          sessionRef.value = noSerialize({
            sessionId,
            salt,
            key,
            remoteDeviceId: remoteDevice.deviceId
          })
          await connection.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
          const answer = await connection.createAnswer()
          await connection.setLocalDescription(answer)
          sendSignal({
            type: 'signal',
            to: contact.id,
            toDeviceId: remoteDevice.deviceId,
            sessionId,
            payload: { type: 'answer', sdp: answer.sdp }
          })
          return
        }

        if (payloadType === 'answer' && typeof payload.sdp === 'string') {
          await connection.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
          return
        }

        if (payloadType === 'candidate' && payload.candidate) {
          try {
            await connection.addIceCandidate(payload.candidate as RTCIceCandidateInit)
          } catch {
            // ignore candidate errors
          }
        }
      }

      const connectWs = (identity: DeviceIdentity) => {
        const wsUrl = buildWsUrl('/chat/p2p/ws', window.location.origin)
        if (!wsUrl) return
        ws?.close()
        ws = new WebSocket(wsUrl)
        ws.addEventListener('open', () => {
          ws?.send(JSON.stringify({ type: 'hello', deviceId: identity.deviceId }))
          while (pendingSignals.length) {
            const signal = pendingSignals.shift()
            if (!signal) break
            ws?.send(JSON.stringify(signal))
          }
        })
        ws.addEventListener('message', async (event) => {
          let payload: unknown
          try {
            payload = JSON.parse(String(event.data))
          } catch {
            return
          }
          if (!isRecord(payload)) return
          const payloadType = payload.type
          const fromId = typeof payload.from === 'string' ? payload.from : ''
          const userId = typeof payload.userId === 'string' ? payload.userId : ''
          if (payloadType === 'p2p:signal' && fromId === contact.id) {
            try {
              await handleSignal(payload)
            } catch (error) {
              dmStatus.value = 'error'
              dmError.value =
                error instanceof Error ? error.message : fragmentCopy.value?.['Unable to deliver message.'] ?? 'Error'
            }
            return
          }
          if (payloadType === 'p2p:mailbox' && userId) {
            await pullMailbox(identity)
          }
        })
        ws.addEventListener('close', () => {
          if (!active) return
          dmStatus.value = dmStatus.value === 'connected' ? 'offline' : dmStatus.value
          if (reconnectTimer !== null) return
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null
            connectWs(identity)
          }, 4000)
        })
        ws.addEventListener('error', () => {
          dmStatus.value = 'error'
        })
      }

      const pullMailbox = async (identity: DeviceIdentity) => {
        try {
          const response = await fetch(buildApiUrl('/chat/p2p/mailbox/pull', window.location.origin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ deviceId: identity.deviceId, limit: 50 })
          })
          if (!response.ok) return
          const payload = (await response.json()) as { messages?: Array<Record<string, unknown>> }
          const messages = Array.isArray(payload.messages) ? payload.messages : []
          if (!messages.length) return
          const ackIds: string[] = []
          for (const entry of messages) {
            if (!isRecord(entry)) continue
            const fromId = typeof entry.from === 'string' ? entry.from : ''
            if (fromId !== contact.id) continue
            const encrypted = resolveEncryptedPayload(entry.payload)
            if (!encrypted) continue
            const senderDeviceId = typeof encrypted.senderDeviceId === 'string' ? encrypted.senderDeviceId : undefined
            const identityDevice = identityRef.value
            if (!identityDevice) continue
            const deviceId = senderDeviceId ?? remoteDeviceRef.value?.deviceId
            if (!deviceId) continue
            const device = await resolveDevice(deviceId)
            if (!device) continue
            remoteDeviceRef.value = noSerialize(device)
            const key = await deriveSessionKey(
              identityDevice.privateKey,
              device.publicKey,
              decodeBase64(encrypted.salt),
              encrypted.sessionId
            )
            sessionRef.value = noSerialize({
              sessionId: encrypted.sessionId,
              salt: encrypted.salt,
              key,
              remoteDeviceId: device.deviceId
            })
            try {
              const plaintext = await decryptPayload(key, encrypted)
              let messageText = plaintext
              let messageId = createMessageId()
              let createdAt = new Date().toISOString()
              let isReceipt = false
              let receiptTargetId: string | null = null
              let isHistoryRequest = false
              let historyLimit = historyRequestLimit
              let historyResponse: DmMessage[] | null = null
              try {
                const messagePayload = JSON.parse(plaintext) as {
                  kind?: string
                  id?: string
                  text?: string
                  createdAt?: string
                  limit?: number
                  messages?: Array<Record<string, unknown>>
                }
                if (messagePayload?.kind === 'receipt') {
                  isReceipt = true
                  if (typeof messagePayload.id === 'string') {
                    receiptTargetId = messagePayload.id
                  }
                } else if (messagePayload?.kind === 'history-request') {
                  isHistoryRequest = true
                  if (Number.isFinite(Number(messagePayload.limit))) {
                    historyLimit = Math.max(1, Math.min(historyCacheLimit, Number(messagePayload.limit)))
                  }
              } else if (messagePayload?.kind === 'history-response') {
                const historyEntries = Array.isArray(messagePayload.messages) ? messagePayload.messages : []
                const mapped: DmMessage[] = []
                for (const entry of historyEntries) {
                  if (!isRecord(entry)) continue
                  const id = typeof entry.id === 'string' ? entry.id : ''
                  const text = typeof entry.text === 'string' ? entry.text : ''
                  const created = typeof entry.createdAt === 'string' ? entry.createdAt : ''
                  const author =
                    entry.author === 'self' ? 'contact' : entry.author === 'contact' ? 'self' : null
                  if (!id || !text || !created || !author) continue
                  mapped.push({ id, text, createdAt: created, author, status: 'sent' })
                }
                historyResponse = mapped
                } else {
                  if (typeof messagePayload?.text === 'string') messageText = messagePayload.text
                  if (typeof messagePayload?.id === 'string') messageId = messagePayload.id
                  if (typeof messagePayload?.createdAt === 'string') createdAt = messagePayload.createdAt
                  if (typeof messagePayload?.id === 'string') {
                    receiptTargetId = messagePayload.id
                  }
                }
              } catch {
                // ignore parse errors
              }
              if (isReceipt) {
                if (receiptTargetId) {
                  dmMessages.value = dmMessages.value.map((message) =>
                    message.id === receiptTargetId ? { ...message, status: 'sent' } : message
                  )
                  void persistHistory(contact.id, identityDevice, dmMessages.value)
                }
              } else if (historyResponse) {
                dmMessages.value = mergeHistoryMessages(dmMessages.value, historyResponse)
                void persistHistory(contact.id, identityDevice, dmMessages.value)
              } else if (isHistoryRequest) {
                let snapshot = dmMessages.value
                if (!snapshot.length) {
                  snapshot = await loadHistory(contact.id, identityDevice)
                }
                if (snapshot.length) {
                  const trimmed = snapshot
                    .slice(-historyLimit)
                    .map((message) => ({
                      id: message.id,
                      text: message.text,
                      createdAt: message.createdAt,
                      author: message.author
                    }))
                  try {
                    const responsePayload = await encryptPayload(
                      key,
                      JSON.stringify({ kind: 'history-response', messages: trimmed }),
                      encrypted.sessionId,
                      encrypted.salt,
                      identityDevice.deviceId
                    )
                    const channel = channelRef.value
                    if (channel && channel.readyState === 'open') {
                      channel.send(JSON.stringify({ type: 'message', payload: responsePayload }))
                    } else {
                      await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ recipientId: entry.from, payload: responsePayload })
                      })
                    }
                  } catch {
                    // ignore history response failures
                  }
                }
              } else {
                dmMessages.value = [
                  ...dmMessages.value,
                  { id: messageId, text: messageText, author: 'contact', createdAt, status: 'sent' }
                ]
                void persistHistory(contact.id, identityDevice, dmMessages.value)
              }
              if (typeof entry.id === 'string') {
                ackIds.push(entry.id)
              }
              if (!isReceipt && !historyResponse && !isHistoryRequest && receiptTargetId) {
                try {
                  const receipt = await encryptPayload(
                    key,
                    JSON.stringify({ kind: 'receipt', id: receiptTargetId }),
                    encrypted.sessionId,
                    encrypted.salt,
                    identityDevice.deviceId
                  )
                  const channel = channelRef.value
                  if (channel && channel.readyState === 'open') {
                    channel.send(JSON.stringify({ type: 'message', payload: receipt }))
                  } else {
                    await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ recipientId: entry.from, payload: receipt })
                    })
                  }
                } catch {
                  // ignore receipt failures
                }
              }
            } catch (error) {
              dmError.value = error instanceof Error ? error.message : 'Unable to decrypt message.'
            }
          }
          if (ackIds.length) {
            await fetch(buildApiUrl('/chat/p2p/mailbox/ack', window.location.origin), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ deviceId: identity.deviceId, messageIds: ackIds })
            })
          }
        } catch {
          // ignore mailbox failures
        }
      }

      const startCaller = async (identity: DeviceIdentity, remoteDevice: ContactDevice) => {
        ensurePeerConnection(identity, remoteDevice)
        if (!connection) return
        channel = connection.createDataChannel('dm', { ordered: true })
        setupChannel(channel)
        const sessionId = createMessageId()
        const salt = randomBase64(16)
        const key = await deriveSessionKey(
          identity.privateKey,
          remoteDevice.publicKey,
          decodeBase64(salt),
          sessionId
        )
        sessionRef.value = noSerialize({
          sessionId,
          salt,
          key,
          remoteDeviceId: remoteDevice.deviceId
        })
        const offer = await connection.createOffer()
        await connection.setLocalDescription(offer)
        sendSignal({
          type: 'signal',
          to: contact.id,
          toDeviceId: remoteDevice.deviceId,
          sessionId,
          payload: { type: 'offer', sdp: offer.sdp, salt }
        })
      }

      void (async () => {
        try {
          const identity = await registerIdentity()
          if (!active) return
          const cached = await loadHistory(contact.id, identity)
          if (!active) return
          historyNeeded = cached.length === 0
          if (cached.length) {
            dmMessages.value = cached
          }
          const nextDevices = await fetchDevices()
          if (!active) return
          if (!nextDevices.length) {
            dmStatus.value = 'offline'
            return
          }
          const target = pickPreferredDevice(nextDevices)
          if (!target) {
            dmStatus.value = 'offline'
            return
          }
          remoteDeviceRef.value = noSerialize(target)
          connectWs(identity)
          await pullMailbox(identity)
          await requestHistory(identity)
          await startCaller(identity, target)
        } catch (error) {
          dmStatus.value = 'error'
          dmError.value = error instanceof Error ? error.message : 'Unable to start direct message.'
        }
      })()

      ctx.cleanup(() => {
        active = false
        closeConnection()
      })
    })

    useVisibleTask$((ctx) => {
      const contact = ctx.track(() => activeContact.value)
      ctx.track(() => dmClosing.value)
      if (typeof document === 'undefined') return
      const root = document.documentElement
      if (activeContact.value || dmClosing.value) {
        root.dataset.chatDmOpen = 'true'
      } else {
        delete root.dataset.chatDmOpen
      }
      if (contact) {
        dmAnimated.value = false
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dmAnimated.value = true
          })
        })
      }
      ctx.cleanup(() => {
        delete root.dataset.chatDmOpen
      })
    })

    const onlineSet = new Set(onlineIds.value)
    const incomingCount = incoming.value.length
    const outgoingCount = outgoing.value.length
    const contactsCount = contacts.value.length
    const incomingAlert = isAlertCount('incoming', incomingCount)
    const outgoingAlert = isAlertCount('outgoing', outgoingCount)
    const baseline = baselineCounts.value
    const outgoingAcceptedAlert =
      !!baseline &&
      Number.isFinite(baseline.contacts) &&
      Number.isFinite(baseline.outgoing) &&
      contactsCount > baseline.contacts &&
      outgoingCount < baseline.outgoing
    const bellAlert = incomingAlert || outgoingAcceptedAlert
    const BellIcon = InBellNotification
    const dmOpen = activeContact.value !== null
    const dmStatusLabel =
      dmStatus.value === 'connected'
        ? resolve('Connected')
        : dmStatus.value === 'connecting'
          ? resolve('Connecting')
          : dmStatus.value === 'offline'
            ? resolve('Offline')
            : resolve('Unavailable')
    const dmStatusTone = dmStatus.value === 'error' ? 'error' : dmStatus.value === 'offline' ? 'muted' : 'neutral'
    const resolveMessageStatus = (status: DmMessage['status']) => {
      if (status === 'pending') return resolve('Sending')
      if (status === 'queued') return resolve('Queued')
      if (status === 'failed') return resolve('Failed')
      return resolve('Sent')
    }
    const normalizedQuery = normalizeQuery(searchQuery.value)
    const contactMatches = normalizedQuery
      ? contacts.value.filter((invite) => matchesQuery(invite.user, normalizedQuery))
      : contacts.value
    const shouldSearchRemote = normalizedQuery !== '' && contactMatches.length === 0
    const contactResults = contactMatches.map<ContactSearchItem>((invite) => ({
      id: invite.user.id,
      name: invite.user.name,
      email: invite.user.email,
      status: 'accepted',
      inviteId: invite.id,
      isContact: true,
      online: onlineSet.has(invite.user.id)
    }))
    const remoteResults = shouldSearchRemote
      ? searchResults.value.map<ContactSearchItem>((result) => ({
          id: result.id,
          name: result.name,
          email: result.email,
          status: result.status,
          inviteId: result.inviteId,
          isContact: false,
          online: false
        }))
      : []
    const displayResults: ContactSearchItem[] = [...contactResults, ...remoteResults]
    const resultsLabel =
      normalizedQuery === '' || contactMatches.length > 0 ? resolvedContactsLabel : resolve('Search results')

    return (
      <section class={rootClass} data-state={invitesState.value} data-dm-open={dmOpen ? 'true' : 'false'}>
        <header class="chat-invites-header">
          <div>
            <p class="chat-invites-title">{resolvedTitle}</p>
            <p class="chat-invites-helper">{resolvedHelper}</p>
          </div>
          <div class="chat-invites-header-actions">
            {statusMessage.value ? (
              <p class="chat-invites-status-note" data-tone={statusTone.value} aria-live="polite">
                {statusMessage.value}
              </p>
            ) : null}
            <div class="chat-invites-bell-wrap">
              <button
                type="button"
                class="chat-invites-bell"
                data-alert={bellAlert ? 'true' : 'false'}
                data-open={bellOpen.value ? 'true' : 'false'}
                aria-haspopup="dialog"
                aria-expanded={bellOpen.value}
                aria-controls="chat-invites-popover"
                aria-label={resolve('Invites')}
                onClick$={toggleBell}
                ref={bellButtonRef}
              >
                <BellIcon class="chat-invites-bell-icon" />
              </button>
              <div
                id="chat-invites-popover"
                class="chat-invites-popover"
                data-open={bellOpen.value ? 'true' : 'false'}
                role="dialog"
                aria-label={resolve('Invites')}
                aria-hidden={!bellOpen.value}
                ref={bellPopoverRef}
              >
                <div class="chat-invites-popover-header">
                  <span>{resolve('Invites')}</span>
                  <span class="chat-invites-popover-count">{incomingCount + outgoingCount}</span>
                </div>
                <div class="chat-invites-popover-body">
                  <section class="chat-invites-subsection">
                    <header class="chat-invites-subheader">
                      <span>{resolvedIncomingLabel}</span>
                      <span class="chat-invites-subcount" data-alert={incomingAlert ? 'true' : 'false'}>
                        {incomingCount}
                      </span>
                    </header>
                    {incoming.value.length === 0 ? (
                      <p class="chat-invites-empty">{resolvedEmptyLabel}</p>
                    ) : (
                      <div class="chat-invites-list">
                        {incoming.value.map((invite, index) => (
                          <article
                            key={invite.id}
                            class="chat-invites-item"
                            style={`--stagger-index:${index};`}
                          >
                            <div>
                              <p class="chat-invites-item-name">{formatDisplayName(invite.user)}</p>
                              <p class="chat-invites-item-meta">{invite.user.email}</p>
                            </div>
                            <div class="chat-invites-actions">
                              <button
                                type="button"
                                class="chat-invites-action success"
                                disabled={busyKeys.value.includes(`accept:${invite.id}`)}
                                onClick$={() => handleAccept(invite.id, invite.user.id)}
                              >
                                {resolvedAcceptAction}
                              </button>
                              <button
                                type="button"
                                class="chat-invites-action ghost"
                                disabled={busyKeys.value.includes(`decline:${invite.id}`)}
                                onClick$={() => handleDecline(invite.id, invite.user.id)}
                              >
                                {resolvedDeclineAction}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                  <section class="chat-invites-subsection">
                    <header class="chat-invites-subheader">
                      <span>{resolvedOutgoingLabel}</span>
                      <span class="chat-invites-subcount" data-alert={outgoingAlert ? 'true' : 'false'}>
                        {outgoingCount}
                      </span>
                    </header>
                    {outgoing.value.length === 0 ? (
                      <p class="chat-invites-empty">{resolvedEmptyLabel}</p>
                    ) : (
                      <div class="chat-invites-list">
                        {outgoing.value.map((invite, index) => (
                          <article
                            key={invite.id}
                            class="chat-invites-item"
                            style={`--stagger-index:${index};`}
                          >
                            <div>
                              <p class="chat-invites-item-name">{formatDisplayName(invite.user)}</p>
                              <p class="chat-invites-item-meta">{invite.user.email}</p>
                            </div>
                            <div class="chat-invites-actions">
                              <span class="chat-invites-pill">{resolve('Pending')}</span>
                              <button
                                type="button"
                                class="chat-invites-action ghost"
                                disabled={busyKeys.value.includes(`remove:${invite.id}`)}
                                onClick$={() => handleRemove(invite.id, invite.user.id, invite.user.email)}
                              >
                                {resolvedRemoveAction}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </div>
        </header>

        <form class="chat-invites-search" preventdefault:submit onSubmit$={handleSearchSubmit}>
          <label class="chat-invites-field">
            <span>{resolvedSearchLabel}</span>
            <input
              type="text"
              inputMode="email"
              placeholder={resolvedSearchPlaceholder}
              value={searchQuery.value}
              onInput$={handleSearchInput}
              aria-label={resolvedSearchLabel}
            />
          </label>
          <button class="chat-invites-button" type="submit" disabled={searchState.value === 'loading'}>
            {searchState.value === 'loading' ? resolve('Searching...') : resolvedSearchAction}
          </button>
        </form>

        <div class="chat-invites-results" data-state={searchState.value}>
          <div class="chat-invites-results-header">
            <span>{resultsLabel}</span>
            {searchError.value ? <span class="chat-invites-error">{searchError.value}</span> : null}
          </div>
          {searchState.value === 'loading' && displayResults.length === 0 ? (
            <p class="chat-invites-empty">{resolve('Searching...')}</p>
          ) : null}
          {searchState.value !== 'loading' && displayResults.length === 0 && normalizedQuery ? (
            <p class="chat-invites-empty">{resolve('No matches yet.')}</p>
          ) : null}
          {searchState.value !== 'loading' && displayResults.length === 0 && !normalizedQuery ? (
            <p class="chat-invites-empty">{resolve('No contacts yet.')}</p>
          ) : null}
          <div class="chat-invites-list">
            {displayResults.map((result, index) => {
              const displayName = formatDisplayName(result)
              const isContact = result.isContact || result.status === 'accepted'
              const isPending = result.status === 'outgoing'
              const isIncoming = result.status === 'incoming'
              const isAccepted = result.status === 'accepted' || isContact
              const isOnline = isContact ? !!result.online : false
              const isActiveContact = activeContact.value?.id === result.id

              return (
                <article
                  key={`${result.id}-${result.email}`}
                  class="chat-invites-item"
                  data-interactive={isContact ? 'true' : 'false'}
                  data-active={isActiveContact ? 'true' : 'false'}
                  data-contact-card={isContact ? 'true' : undefined}
                  style={`--stagger-index:${index};`}
                  role={isContact ? 'button' : undefined}
                  tabIndex={isContact ? 0 : undefined}
                  aria-label={isContact ? resolve('Open direct message') : undefined}
                  onClick$={isContact ? (event) => handleContactClick(event, result) : undefined}
                  onKeyDown$={isContact ? (event) => handleContactKeyDown(event, result) : undefined}
                >
                  <div>
                    <div class="chat-invites-item-heading">
                      {isContact ? (
                        <span
                          class="chat-invites-presence"
                          data-online={isOnline ? 'true' : 'false'}
                          aria-hidden="true"
                        />
                      ) : null}
                      <p class="chat-invites-item-name">{displayName}</p>
                    </div>
                    <p class="chat-invites-item-meta">{result.email}</p>
                  </div>
                  <div class="chat-invites-actions">
                    {isAccepted ? <span class="chat-invites-pill">{resolve('Connected')}</span> : null}
                    {isPending ? <span class="chat-invites-pill">{resolve('Pending')}</span> : null}
                    {isIncoming ? <span class="chat-invites-pill accent">{resolve('Incoming')}</span> : null}
                    {isContact && result.inviteId ? (
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`remove:${result.inviteId}`)}
                        onClick$={() => handleRemove(result.inviteId!, result.id, result.email)}
                      >
                        {resolvedRemoveAction}
                      </button>
                    ) : null}
                    {(result.status === 'none' || result.status === undefined) && !isContact ? (
                      <button
                        type="button"
                        class="chat-invites-action"
                        disabled={busyKeys.value.includes(`invite:${result.email}`)}
                        onClick$={() => handleInvite(result.email, result.id)}
                      >
                        {resolvedInviteAction}
                      </button>
                    ) : null}
                    {isIncoming && result.inviteId && !isContact ? (
                      <button
                        type="button"
                        class="chat-invites-action success"
                        disabled={busyKeys.value.includes(`accept:${result.inviteId}`)}
                        onClick$={() => handleAccept(result.inviteId!, result.id)}
                      >
                        {resolvedAcceptAction}
                      </button>
                    ) : null}
                    {isIncoming && result.inviteId && !isContact ? (
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`decline:${result.inviteId}`)}
                        onClick$={() => handleDecline(result.inviteId!, result.id)}
                      >
                        {resolvedDeclineAction}
                      </button>
                    ) : null}
                    {(isPending || isAccepted) && result.inviteId && !isContact ? (
                      <button
                        type="button"
                        class="chat-invites-action ghost"
                        disabled={busyKeys.value.includes(`remove:${result.inviteId}`)}
                        onClick$={() => handleRemove(result.inviteId!, result.id, result.email)}
                      >
                        {resolvedRemoveAction}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
        {activeContact.value ? (
          <div
            class="chat-invites-dm"
            role="dialog"
            aria-modal="true"
            aria-label={resolve('Direct message')}
            data-closing={dmClosing.value ? 'true' : 'false'}
            data-animate={dmAnimated.value ? 'true' : 'false'}
            style={
              dmOrigin.value
                ? {
                    '--dm-origin-x': `${dmOrigin.value.x}px`,
                    '--dm-origin-y': `${dmOrigin.value.y}px`,
                    '--dm-origin-scale-x': `${dmOrigin.value.scaleX}`,
                    '--dm-origin-scale-y': `${dmOrigin.value.scaleY}`,
                    '--dm-origin-radius': `${dmOrigin.value.radius}px`
                  }
                : undefined
            }
          >
            <div class="chat-invites-dm-card">
              <header class="chat-invites-dm-header">
                <button type="button" class="chat-invites-dm-close" onClick$={closeContact}>
                  {resolve('Back')}
                </button>
                <div>
                  <div class="chat-invites-item-heading">
                    <span
                      class="chat-invites-presence"
                      data-online={activeContact.value.online ? 'true' : 'false'}
                      aria-hidden="true"
                    />
                    <p class="chat-invites-dm-title">{formatDisplayName(activeContact.value)}</p>
                  </div>
                  <p class="chat-invites-dm-meta">{activeContact.value.email}</p>
                </div>
              </header>
              <div class="chat-invites-dm-body">
                <div class="chat-invites-dm-status" data-tone={dmStatusTone}>
                  <span>{dmStatusLabel}</span>
                  {dmError.value ? <span class="chat-invites-dm-error">{dmError.value}</span> : null}
                </div>
                <div class="chat-invites-dm-messages" role="log" aria-live="polite">
                  {dmMessages.value.length === 0 ? (
                    <p class="chat-invites-dm-placeholder">{resolve('No messages yet.')}</p>
                  ) : (
                    dmMessages.value.map((message) => (
                      <article
                        key={message.id}
                        class="chat-invites-dm-message"
                        data-author={message.author}
                        data-status={message.status ?? 'sent'}
                      >
                        <p class="chat-invites-dm-text">{message.text}</p>
                        <div class="chat-invites-dm-meta">
                          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                          {message.author === 'self' && message.status && message.status !== 'sent' ? (
                            <span class="chat-invites-dm-state">{resolveMessageStatus(message.status)}</span>
                          ) : null}
                        </div>
                      </article>
                    ))
                  )}
                </div>
                <form class="chat-invites-dm-compose" preventdefault:submit onSubmit$={handleDmSubmit}>
                  <input
                    type="text"
                    class="chat-invites-dm-input"
                    placeholder={resolve('Message')}
                    value={dmInput.value}
                    onInput$={handleDmInput}
                    aria-label={resolve('Message')}
                  />
                  <button class="chat-invites-dm-send" type="submit" disabled={!dmInput.value.trim()}>
                    {resolve('Send')}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    )
  }
)

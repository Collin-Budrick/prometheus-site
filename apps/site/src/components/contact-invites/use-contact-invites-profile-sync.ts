import { useSignal, useVisibleTask$, type NoSerialize, type QRL, type Signal } from '@builder.io/qwik'
import {
  decodeBase64,
  decryptPayload,
  deriveSessionKey,
  encryptPayload,
  randomBase64,
  type DeviceIdentity
} from '../../shared/p2p-crypto'
import {
  buildProfileMeta,
  loadLocalProfile,
  loadRemoteProfile,
  loadRemoteProfileMeta,
  parseProfileMeta,
  parseProfilePayload,
  saveRemoteProfile,
  saveRemoteProfileMeta,
  PROFILE_UPDATED_EVENT,
  type ProfilePayload
} from '../../shared/profile-storage'
import { buildApiUrl, buildWsUrl } from './api'
import { createMessageId, isRecord, pickPreferredDevice, resolveEncryptedPayload } from './utils'
import type { ContactDevice, ContactInviteView } from './types'

type ContactInvitesProfileSyncOptions = {
  contacts: Signal<ContactInviteView[]>
  onlineIds: Signal<string[]>
  contactProfiles: Signal<Record<string, ProfilePayload>>
  localProfile: Signal<ProfilePayload | null>
  identityRef: Signal<NoSerialize<DeviceIdentity> | undefined>
  registerIdentity: QRL<() => Promise<DeviceIdentity>>
}

export const useContactInvitesProfileSync = (options: ContactInvitesProfileSyncOptions) => {
  const syncReady = useSignal(false)
  let requestProfileForContact: ((userId: string) => void) | null = null
  let onlineContactIds = new Set<string>()

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    let active = true
    let identity: DeviceIdentity | null = null
    let ws: WebSocket | null = null
    let reconnectTimer: number | null = null
    let mailboxPulling = false
    let mailboxPullPending = false
    const devicesByUser = new Map<string, ContactDevice[]>()
    const requestCooldownMs = 60_000
    const updateCooldownMs = 15_000
    const lastRequestAt = new Map<string, number>()
    const lastUpdateAt = new Map<string, number>()
    const inFlight = new Set<string>()

    const ensureIdentity = async () => {
      if (identity) return identity
      const existing = options.identityRef.value
      if (existing) {
        identity = existing
        return identity
      }
      identity = await options.registerIdentity()
      return identity
    }

    const fetchDevices = async (userId: string) => {
      if (!userId) return []
      try {
        const response = await fetch(
          buildApiUrl(`/chat/p2p/devices/${encodeURIComponent(userId)}`, window.location.origin),
          { credentials: 'include' }
        )
        if (!response.ok) return []
        const payload = (await response.json()) as { devices?: ContactDevice[] }
        const devices = Array.isArray(payload.devices) ? payload.devices.filter((device) => device.deviceId) : []
        devicesByUser.set(userId, devices)
        return devices
      } catch {
        return []
      }
    }

    const resolveDevice = async (userId: string, deviceId?: string) => {
      const cached = devicesByUser.get(userId)
      let devices = cached ?? []
      if (!devices.length) {
        devices = await fetchDevices(userId)
      }
      if (!devices.length) return null
      if (deviceId) {
        return devices.find((device) => device.deviceId === deviceId) ?? null
      }
      return pickPreferredDevice(devices)
    }

    const resolveLocalProfile = () => {
      const cached = options.localProfile.value
      if (cached) return cached
      const stored = loadLocalProfile()
      if (stored) {
        options.localProfile.value = stored
      }
      return stored
    }

    const sendEncryptedPayload = async (
      recipientId: string,
      device: ContactDevice,
      payload: Record<string, unknown>
    ) => {
      const resolved = await ensureIdentity()
      const sessionId = createMessageId()
      const salt = randomBase64(16)
      const key = await deriveSessionKey(resolved.privateKey, device.publicKey, decodeBase64(salt), sessionId)
      const encrypted = await encryptPayload(
        key,
        JSON.stringify(payload),
        sessionId,
        salt,
        resolved.deviceId
      )
      await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipientId,
          sessionId,
          deviceIds: [device.deviceId],
          payload: encrypted
        })
      })
    }

    const sendProfileRequest = async (userId: string, deviceId?: string) => {
      if (!userId) return
      const now = Date.now()
      const last = lastRequestAt.get(userId)
      if (last !== undefined && now - last < requestCooldownMs) return
      if (inFlight.has(userId)) return
      inFlight.add(userId)
      try {
        const device = await resolveDevice(userId, deviceId)
        if (!device) return
        await sendEncryptedPayload(userId, device, { kind: 'profile-request' })
        lastRequestAt.set(userId, now)
      } catch {
        // ignore request failures
      } finally {
        inFlight.delete(userId)
      }
    }

    const sendProfileUpdate = async (userId: string, deviceId?: string) => {
      if (!userId) return
      const profile = resolveLocalProfile()
      if (!profile) return
      const now = Date.now()
      const last = lastUpdateAt.get(userId)
      if (last !== undefined && now - last < updateCooldownMs) return
      const device = await resolveDevice(userId, deviceId)
      if (!device) return
      const meta = buildProfileMeta(profile)
      if (!meta) return
      const payload = { ...profile, ...meta }
      await sendEncryptedPayload(userId, device, { kind: 'profile-update', profile: payload })
      lastUpdateAt.set(userId, now)
    }

    const handleProfileUpdateEvent = () => {
      const contacts = options.contacts.value
      if (!contacts.length) return
      contacts.forEach((contact) => {
        void sendProfileUpdate(contact.user.id)
      })
    }

    const handleIncomingProfile = (userId: string, profile: ProfilePayload) => {
      saveRemoteProfile(userId, profile)
      options.contactProfiles.value = { ...options.contactProfiles.value, [userId]: profile }
    }

    const pullMailbox = async (resolved: DeviceIdentity) => {
      if (mailboxPulling) {
        mailboxPullPending = true
        return
      }
      mailboxPulling = true
      try {
        const response = await fetch(buildApiUrl('/chat/p2p/mailbox/pull', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deviceId: resolved.deviceId, limit: 50 })
        })
        if (!response.ok) return
        const payload = (await response.json()) as { messages?: Array<Record<string, unknown>> }
        const messages = Array.isArray(payload.messages) ? payload.messages : []
        if (!messages.length) return
        const ackIds: string[] = []
        for (const entry of messages) {
          if (!isRecord(entry)) continue
          const messageId = typeof entry.id === 'string' ? entry.id : ''
          const senderId = typeof entry.from === 'string' ? entry.from : ''
          if (!messageId || !senderId) continue
          const encrypted = resolveEncryptedPayload(entry.payload)
          if (!encrypted) continue
          const senderDeviceId =
            typeof encrypted.senderDeviceId === 'string' ? encrypted.senderDeviceId : undefined
          if (!senderDeviceId) continue
          const senderDevice = await resolveDevice(senderId, senderDeviceId)
          if (!senderDevice) continue
          try {
            const key = await deriveSessionKey(
              resolved.privateKey,
              senderDevice.publicKey,
              decodeBase64(encrypted.salt),
              encrypted.sessionId
            )
            const plaintext = await decryptPayload(key, encrypted)
            const payload = JSON.parse(plaintext)
            if (!payload || typeof payload !== 'object') continue
            const message = payload as Record<string, unknown>
            const kind = typeof message.kind === 'string' ? message.kind : ''
            if (kind === 'profile-request') {
              await sendProfileUpdate(senderId, senderDeviceId)
              ackIds.push(messageId)
              continue
            }
            if (kind === 'profile-update') {
              const parsed = parseProfilePayload(message.profile ?? message)
              if (parsed) {
                handleIncomingProfile(senderId, parsed)
                ackIds.push(messageId)
              }
              continue
            }
            if (kind === 'profile-meta') {
              const meta = parseProfileMeta(message.meta)
              if (meta) {
                const cached = loadRemoteProfileMeta(senderId)
                const existingProfile =
                  options.contactProfiles.value[senderId] ?? loadRemoteProfile(senderId)
                if (existingProfile && !options.contactProfiles.value[senderId]) {
                  options.contactProfiles.value = { ...options.contactProfiles.value, [senderId]: existingProfile }
                }
                saveRemoteProfileMeta(senderId, meta)
                if (!existingProfile || !cached || cached.hash !== meta.hash) {
                  await sendProfileRequest(senderId, senderDeviceId)
                }
                ackIds.push(messageId)
              }
            }
          } catch {
            // ignore decrypt failures
          }
        }
        if (ackIds.length) {
          await fetch(buildApiUrl('/chat/p2p/mailbox/ack', window.location.origin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ deviceId: resolved.deviceId, messageIds: ackIds })
          })
        }
      } catch {
        // ignore mailbox failures
      } finally {
        mailboxPulling = false
        if (mailboxPullPending) {
          mailboxPullPending = false
          void pullMailbox(resolved)
        }
      }
    }

    const connect = async () => {
      const resolved = await ensureIdentity()
      if (!active) return
      const wsUrl = buildWsUrl('/chat/p2p/ws', window.location.origin)
      if (!wsUrl) return
      ws?.close()
      ws = new WebSocket(wsUrl)
      ws.addEventListener('open', () => {
        ws?.send(JSON.stringify({ type: 'hello', deviceId: resolved.deviceId }))
        void pullMailbox(resolved)
      })
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
        if (type === 'p2p:mailbox') {
          const deviceIds = Array.isArray(record.deviceIds) ? record.deviceIds : []
          if (deviceIds.length && !deviceIds.includes(resolved.deviceId)) return
          void pullMailbox(resolved)
        }
      })
      ws.addEventListener('close', () => {
        if (!active) return
        if (reconnectTimer !== null) return
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          void connect()
        }, 5000)
      })
    }

    requestProfileForContact = (userId: string) => {
      void sendProfileRequest(userId)
    }

    void connect()
    syncReady.value = true
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdateEvent)

    ctx.cleanup(() => {
      active = false
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdateEvent)
      ws?.close()
    })
  })

  useVisibleTask$((ctx) => {
    if (typeof window === 'undefined') return
    ctx.track(() => syncReady.value)
    const contacts = ctx.track(() => options.contacts.value)
    const onlineIds = ctx.track(() => options.onlineIds.value)
    if (!syncReady.value || !requestProfileForContact) return
    const onlineSet = new Set(onlineIds)
    const nextOnline = new Set<string>()
    contacts.forEach((contact) => {
      const userId = contact.user.id
      if (!userId) return
      if (onlineSet.has(userId)) {
        nextOnline.add(userId)
      }
      const cached = options.contactProfiles.value[userId] ?? loadRemoteProfile(userId)
      if (!cached) {
        requestProfileForContact(userId)
      }
    })
    onlineContactIds = nextOnline
  })
}

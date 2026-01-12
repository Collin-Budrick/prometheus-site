import { noSerialize, useVisibleTask$, type NoSerialize, type QRL, type Signal } from '@builder.io/qwik'
import type { ChatSettings } from '../../shared/chat-settings'
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
  type ProfileMeta,
  type ProfilePayload
} from '../../shared/profile-storage'
import { buildApiUrl, buildWsUrl } from './api'
import {
  historyCacheLimit,
  historyRequestLimit,
  loadHistory,
  loadHistoryArchiveStamp,
  mergeHistoryMessages,
  persistHistory
} from './history'
import { createMessageId, isRecord, pickPreferredDevice, resolveEncryptedPayload } from './utils'
import type { ActiveContact, ContactDevice, DmConnectionState, DmMessage, P2pSession } from './types'

type DmConnectionOptions = {
  activeContact: Signal<ActiveContact | null>
  dmMessages: Signal<DmMessage[]>
  dmInput: Signal<string>
  dmStatus: Signal<DmConnectionState>
  dmError: Signal<string | null>
  channelRef: Signal<NoSerialize<RTCDataChannel> | undefined>
  identityRef: Signal<NoSerialize<DeviceIdentity> | undefined>
  sessionRef: Signal<NoSerialize<P2pSession> | undefined>
  remoteDeviceRef: Signal<NoSerialize<ContactDevice> | undefined>
  localProfile: Signal<ProfilePayload | null>
  contactProfiles: Signal<Record<string, ProfilePayload>>
  chatSettings: Signal<ChatSettings>
  remoteTyping: Signal<boolean>
  remoteTypingTimer: Signal<number | null>
  historySuppressed: Signal<boolean>
  fragmentCopy: Signal<Record<string, string>>
  registerIdentity: QRL<() => Promise<DeviceIdentity>>
  sendTyping: QRL<(state: 'start' | 'stop') => Promise<void>>
}

export const useDmConnection = (options: DmConnectionOptions) => {
  useVisibleTask$((ctx) => {
    const contact = ctx.track(() => options.activeContact.value)
    if (typeof window === 'undefined') return

    if (!contact) {
      options.dmStatus.value = 'idle'
      options.dmMessages.value = []
      options.dmInput.value = ''
      options.dmError.value = null
      options.sessionRef.value = undefined
      options.remoteDeviceRef.value = undefined
      options.historySuppressed.value = false
      return
    }

    const setRemoteTyping = (activeState: boolean) => {
      if (!options.chatSettings.value.typingIndicators) return
      options.remoteTyping.value = activeState
      if (options.remoteTypingTimer.value !== null) {
        window.clearTimeout(options.remoteTypingTimer.value)
        options.remoteTypingTimer.value = null
      }
      if (activeState) {
        options.remoteTypingTimer.value = window.setTimeout(() => {
          options.remoteTyping.value = false
          options.remoteTypingTimer.value = null
        }, 2500)
      }
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

    let active = true
    let devices: ContactDevice[] = []
    let connection: RTCPeerConnection | null = null
    let channel: RTCDataChannel | null = null
    let ws: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let reconnecting = false
    let isPolite = false
    let makingOffer = false
    let mailboxPulling = false
    let mailboxPullPending = false
    let mailboxCooldownUntil = 0
    let mailboxTimer: number | null = null
    let historyRequested = false
    let historyNeeded = false
    const avatarChunkSize = 12_000
    const avatarChunks = new Map<string, { total: number; chunks: string[]; updatedAt?: string }>()
    const imageChunks = new Map<
      string,
      {
        total: number
        chunks: string[]
        meta?: {
          id: string
          createdAt: string
          name?: string
          mime?: string
          size?: number
          width?: number
          height?: number
        }
      }
    >()
    const pendingSignals: Array<Record<string, unknown>> = []
    const pendingCandidates: RTCIceCandidateInit[] = []
    const handledSignals = new Set<string>()
    const debug = (...args: unknown[]) => {
      if (typeof window === 'undefined') return
      if (window.localStorage?.getItem('p2pDebug') !== '1') return
      console.info('[p2p]', ...args)
    }

    options.dmStatus.value = 'connecting'
    options.dmMessages.value = []
    options.dmInput.value = ''
    options.dmError.value = null
    options.historySuppressed.value = false
    options.sessionRef.value = undefined

    const closeConnection = () => {
      debug('closing dm connection')
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (mailboxTimer !== null) {
        window.clearTimeout(mailboxTimer)
        mailboxTimer = null
      }
      reconnecting = false
      reconnectAttempt = 0
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
      options.channelRef.value = undefined
    }

    const resetPeerConnection = () => {
      if (channel) {
        channel.close()
        channel = null
      }
      if (connection) {
        connection.close()
        connection = null
      }
      options.channelRef.value = undefined
      options.sessionRef.value = undefined
      makingOffer = false
    }

    const scheduleReconnect = async (reason: string) => {
      if (!active) return
      if (reconnecting) return
      const identity = options.identityRef.value
      const remoteDevice = options.remoteDeviceRef.value
      if (!identity || !remoteDevice) return
      if (reconnectAttempt >= 3) {
        options.dmStatus.value = 'offline'
        return
      }
      reconnectAttempt += 1
      reconnecting = true
      options.dmStatus.value = 'connecting'
      debug('reconnect scheduled', { reason, attempt: reconnectAttempt })
      await new Promise((resolve) => window.setTimeout(resolve, 1200))
      resetPeerConnection()
      reconnecting = false
      const shouldInitiate = identity.deviceId.localeCompare(remoteDevice.deviceId) < 0
      if (shouldInitiate) {
        await startCaller(identity, remoteDevice)
      }
    }

    const flushCandidates = async () => {
      if (!connection || !connection.remoteDescription) return
      while (pendingCandidates.length) {
        const candidate = pendingCandidates.shift()
        if (!candidate) continue
        try {
          await connection.addIceCandidate(candidate)
          debug('added pending ice candidate')
        } catch {
          // ignore candidate failures
        }
      }
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
        debug('fetched devices', { count: next.length, devices: next.map((entry) => entry.deviceId) })
        if (!options.remoteDeviceRef.value) {
          const preferred = pickPreferredDevice(next)
          if (preferred) {
            options.remoteDeviceRef.value = noSerialize(preferred)
          }
        }
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

    const resolveRemoteDevice = async (deviceId?: string) => {
      if (deviceId) {
        const found = await resolveDevice(deviceId)
        if (found) return found
      }
      await fetchDevices()
      return pickPreferredDevice(devices)
    }

    const sendSignalViaMailbox = async (signal: Record<string, unknown>) => {
      const identity = options.identityRef.value
      if (!identity) return
      const toDeviceId = typeof signal.toDeviceId === 'string' ? signal.toDeviceId : undefined
      const device = await resolveRemoteDevice(toDeviceId)
      if (!device) return
      debug('signal via mailbox', { type: (signal.payload as Record<string, unknown> | undefined)?.type, to: device.deviceId })
      try {
        const sessionId = createMessageId()
        const salt = randomBase64(16)
        const key = await deriveSessionKey(identity.privateKey, device.publicKey, decodeBase64(salt), sessionId)
        const encrypted = await encryptPayload(
          key,
          JSON.stringify({
            kind: 'signal',
            payload: signal.payload,
            sessionId: signal.sessionId,
            toDeviceId
          }),
          sessionId,
          salt,
          identity.deviceId
        )
        await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            recipientId: contact.id,
            sessionId,
            deviceIds: [device.deviceId],
            payload: encrypted
          })
        })
      } catch {
        // ignore signal mailbox failures
      }
    }

    const sendSignal = (signal: Record<string, unknown>) => {
      const payload = isRecord(signal.payload) ? signal.payload : null
      const payloadType = payload?.type
      const wsOpen = ws?.readyState === WebSocket.OPEN
      const shouldMirror =
        payloadType === 'offer' || payloadType === 'answer' || (!wsOpen && payloadType === 'candidate')
      if (wsOpen) {
        debug('signal via ws', { type: payloadType })
        ws?.send(JSON.stringify(signal))
        if (shouldMirror) {
          void sendSignalViaMailbox(signal)
        }
        return
      }
      debug('signal queued for mailbox', { type: payloadType })
      void sendSignalViaMailbox(signal)
      pendingSignals.push(signal)
    }

    const waitForIceGatheringComplete = async (peer: RTCPeerConnection, timeoutMs = 2000) => {
      if (peer.iceGatheringState === 'complete') return
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          peer.removeEventListener('icegatheringstatechange', handleChange)
          resolve()
        }, timeoutMs)
        const handleChange = () => {
          if (peer.iceGatheringState === 'complete') {
            window.clearTimeout(timer)
            peer.removeEventListener('icegatheringstatechange', handleChange)
            resolve()
          }
        }
        peer.addEventListener('icegatheringstatechange', handleChange)
      })
    }

    const applyConnectionState = () => {
      if (!connection) return
      const state = connection.connectionState
      debug('connection state', state)
      if (state === 'connected') {
        options.dmStatus.value = 'connected'
        return
      }
      if (state === 'failed' || state === 'disconnected') {
        void scheduleReconnect(`connection-${state}`)
      }
    }

    const appendIncomingMessage = (message: DmMessage) => {
      if (options.dmMessages.value.some((entry) => entry.id === message.id)) return false
      options.dmMessages.value = [...options.dmMessages.value, message]
      return true
    }

    const applyRemoteProfile = (profile: ProfilePayload) => {
      const existing = options.contactProfiles.value[contact.id] ?? loadRemoteProfile(contact.id)
      const merged: ProfilePayload = {
        ...existing,
        ...profile,
        avatar: profile.avatar ?? existing?.avatar
      }
      saveRemoteProfile(contact.id, merged)
      options.contactProfiles.value = { ...options.contactProfiles.value, [contact.id]: merged }
    }

    const sendProfilePayload = async (payload: Record<string, unknown>) => {
      const identity = options.identityRef.value
      const session = options.sessionRef.value
      if (!identity || !session || !channel || channel.readyState !== 'open') return
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
        // ignore profile payload failures
      }
    }

    const sendProfileMeta = async () => {
      const profile = resolveLocalProfile()
      if (!profile) return
      const meta = buildProfileMeta(profile)
      if (!meta) return
      await sendProfilePayload({ kind: 'profile-meta', meta })
    }

    const sendAvatarChunks = async (avatar: string, meta: ProfileMeta) => {
      if (!channel || channel.readyState !== 'open') return
      const total = Math.ceil(avatar.length / avatarChunkSize)
      for (let index = 0; index < total; index += 1) {
        if (!channel || channel.readyState !== 'open') return
        const data = avatar.slice(index * avatarChunkSize, (index + 1) * avatarChunkSize)
        await sendProfilePayload({
          kind: 'profile-avatar-chunk',
          hash: meta.hash,
          updatedAt: meta.updatedAt,
          index,
          total,
          data
        })
        if (total > 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 0))
        }
      }
    }

    const sendProfileUpdate = async (profile: ProfilePayload | null, targetDeviceId?: string) => {
      const nextProfile = profile ?? resolveLocalProfile()
      if (!nextProfile) return
      const meta = buildProfileMeta(nextProfile)
      if (!meta) return
      const avatar = nextProfile.avatar
      const needsChunking = Boolean(avatar && avatar.length > avatarChunkSize)
      const payload = {
        ...nextProfile,
        avatar: !needsChunking ? avatar : undefined,
        avatarChunked: needsChunking ? true : undefined,
        ...meta
      }
      if (channel && channel.readyState === 'open') {
        await sendProfilePayload({ kind: 'profile-update', profile: payload })
        if (needsChunking && avatar) {
          await sendAvatarChunks(avatar, meta)
        }
        return
      }
      const identity = options.identityRef.value
      if (!identity) return
      const device = await resolveRemoteDevice(targetDeviceId)
      if (!device) return
      try {
        const sessionId = createMessageId()
        const salt = randomBase64(16)
        const key = await deriveSessionKey(identity.privateKey, device.publicKey, decodeBase64(salt), sessionId)
        const encrypted = await encryptPayload(
          key,
          JSON.stringify({
            kind: 'profile-update',
            profile: { ...payload, avatar: undefined, avatarChunked: undefined }
          }),
          sessionId,
          salt,
          identity.deviceId
        )
        await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            recipientId: contact.id,
            sessionId,
            deviceIds: [device.deviceId],
            payload: encrypted
          })
        })
      } catch {
        // ignore profile update failures
      }
    }

    const sendReceipt = async (key: CryptoKey, sessionId: string, salt: string, receiptId: string) => {
      if (!options.chatSettings.value.readReceipts) return
      const identity = options.identityRef.value
      if (!identity) return
      try {
        const receipt = await encryptPayload(
          key,
          JSON.stringify({ kind: 'receipt', id: receiptId }),
          sessionId,
          salt,
          identity.deviceId
        )
        const activeChannel = options.channelRef.value ?? channel
        if (activeChannel && activeChannel.readyState === 'open') {
          activeChannel.send(JSON.stringify({ type: 'message', payload: receipt }))
        } else {
          await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ recipientId: contact.id, payload: receipt })
          })
        }
      } catch {
        // ignore receipt failures
      }
    }

    const storeImageMeta = (meta: {
      id: string
      createdAt: string
      total: number
      name?: string
      mime?: string
      size?: number
      width?: number
      height?: number
    }) => {
      const existing = imageChunks.get(meta.id)
      if (existing) {
        existing.meta = meta
        if (existing.total !== meta.total) {
          existing.total = meta.total
          existing.chunks = new Array(meta.total).fill('')
        }
        return
      }
      imageChunks.set(meta.id, {
        total: meta.total,
        chunks: new Array(meta.total).fill(''),
        meta
      })
    }

    const storeImageChunk = (
      payload: { id: string; index: number; total: number; data: string },
      author: DmMessage['author']
    ) => {
      const existing =
        imageChunks.get(payload.id) ?? {
          total: payload.total,
          chunks: new Array(payload.total).fill(''),
          meta: undefined
        }
      if (existing.total !== payload.total) {
        existing.total = payload.total
        existing.chunks = new Array(payload.total).fill('')
      }
      if (payload.index >= 0 && payload.index < existing.total) {
        existing.chunks[payload.index] = payload.data
      }
      imageChunks.set(payload.id, existing)
      if (!existing.chunks.every((chunk) => chunk)) {
        return null
      }
      const meta = existing.meta
      const base64 = existing.chunks.join('')
      const mime = meta?.mime ?? 'image/png'
      const dataUrl = `data:${mime};base64,${base64}`
      const createdAt = meta?.createdAt ?? new Date().toISOString()
      imageChunks.delete(payload.id)
      return {
        id: payload.id,
        text: '',
        author,
        createdAt,
        status: 'sent',
        kind: 'image',
        image: {
          dataUrl,
          name: meta?.name,
          mime,
          size: meta?.size,
          width: meta?.width,
          height: meta?.height
        }
      } satisfies DmMessage
    }

    const requestProfileUpdate = async (meta: ProfileMeta, targetDeviceId?: string) => {
      if (channel && channel.readyState === 'open') {
        await sendProfilePayload({ kind: 'profile-request', meta })
        return
      }
      const identity = options.identityRef.value
      if (!identity) return
      const device = await resolveRemoteDevice(targetDeviceId)
      if (!device) return
      try {
        const sessionId = createMessageId()
        const salt = randomBase64(16)
        const key = await deriveSessionKey(identity.privateKey, device.publicKey, decodeBase64(salt), sessionId)
        const encrypted = await encryptPayload(
          key,
          JSON.stringify({ kind: 'profile-request', meta }),
          sessionId,
          salt,
          identity.deviceId
        )
        await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            recipientId: contact.id,
            sessionId,
            deviceIds: [device.deviceId],
            payload: encrypted
          })
        })
      } catch {
        // ignore profile request failures
      }
    }

    const handleProfileUpdateEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { profile?: ProfilePayload } | undefined
      if (!detail?.profile) return
      options.localProfile.value = detail.profile
      if (channel && channel.readyState === 'open') {
        void sendProfileUpdate(detail.profile)
      }
    }

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdateEvent)

    const setupChannel = (next: RTCDataChannel) => {
      channel = next
      options.channelRef.value = noSerialize(next)
      next.onopen = () => {
        reconnectAttempt = 0
        debug('data channel open', next.label)
        options.dmStatus.value = 'connected'
        if (options.chatSettings.value.typingIndicators && options.dmInput.value.trim()) {
          void options.sendTyping('start')
        }
        void sendProfileMeta()
      }
      next.onclose = () => {
        debug('data channel close', next.label)
        void scheduleReconnect('datachannel-close')
      }
      next.onerror = () => {
        debug('data channel error', next.label)
        void scheduleReconnect('datachannel-error')
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
          const identity = options.identityRef.value
          if (!identity) return
          const deviceId =
            senderDeviceId ?? options.sessionRef.value?.remoteDeviceId ?? options.remoteDeviceRef.value?.deviceId
          if (!deviceId) return
          const device = await resolveDevice(deviceId)
          if (!device) return
          options.remoteDeviceRef.value = noSerialize(device)
          const key = await deriveSessionKey(
            identity.privateKey,
            device.publicKey,
            decodeBase64(encrypted.salt),
            encrypted.sessionId
          )
          options.sessionRef.value = noSerialize({
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
          let typingState: 'start' | 'stop' | null = null
          let profileMeta: ProfileMeta | null = null
          let profilePayload: ProfilePayload | null = null
          let avatarChunk: { hash: string; updatedAt?: string; index: number; total: number; data: string } | null =
            null
          let imageMeta:
            | { id: string; createdAt: string; total: number; name?: string; mime?: string; size?: number; width?: number; height?: number }
            | null = null
          let imageChunk: { id: string; index: number; total: number; data: string } | null = null
          let profileRequest = false
          try {
            const messagePayload = JSON.parse(plaintext) as {
              kind?: string
              id?: string
              text?: string
              createdAt?: string
              limit?: number
              messages?: Array<Record<string, unknown>>
              state?: string
              meta?: Record<string, unknown>
              profile?: Record<string, unknown>
              hash?: string
              updatedAt?: string
              index?: number
              total?: number
              data?: string
              name?: string
              mime?: string
              size?: number
              width?: number
              height?: number
            }
            if (messagePayload?.kind === 'receipt') {
              isReceipt = true
              if (typeof messagePayload.id === 'string') {
                receiptTargetId = messagePayload.id
              }
            } else if (messagePayload?.kind === 'typing') {
              if (messagePayload.state === 'start' || messagePayload.state === 'stop') {
                typingState = messagePayload.state
              }
            } else if (messagePayload?.kind === 'profile-avatar-chunk') {
              const hash = typeof messagePayload.hash === 'string' ? messagePayload.hash : ''
              const index = Number(messagePayload.index)
              const total = Number(messagePayload.total)
              const data = typeof messagePayload.data === 'string' ? messagePayload.data : ''
              if (hash && Number.isFinite(index) && Number.isFinite(total) && data) {
                avatarChunk = {
                  hash,
                  updatedAt: typeof messagePayload.updatedAt === 'string' ? messagePayload.updatedAt : undefined,
                  index,
                  total,
                  data
                }
              }
            } else if (messagePayload?.kind === 'image-meta') {
              const id = typeof messagePayload.id === 'string' ? messagePayload.id : ''
              const total = Number(messagePayload.total)
              if (id && Number.isFinite(total) && total > 0) {
                imageMeta = {
                  id,
                  createdAt: typeof messagePayload.createdAt === 'string' ? messagePayload.createdAt : new Date().toISOString(),
                  total,
                  name: typeof messagePayload.name === 'string' ? messagePayload.name : undefined,
                  mime: typeof messagePayload.mime === 'string' ? messagePayload.mime : undefined,
                  size: typeof messagePayload.size === 'number' ? messagePayload.size : undefined,
                  width: typeof messagePayload.width === 'number' ? messagePayload.width : undefined,
                  height: typeof messagePayload.height === 'number' ? messagePayload.height : undefined
                }
              }
            } else if (messagePayload?.kind === 'image-chunk') {
              const id = typeof messagePayload.id === 'string' ? messagePayload.id : ''
              const index = Number(messagePayload.index)
              const total = Number(messagePayload.total)
              const data = typeof messagePayload.data === 'string' ? messagePayload.data : ''
              if (id && Number.isFinite(index) && Number.isFinite(total) && data) {
                imageChunk = { id, index, total, data }
              }
            } else if (messagePayload?.kind === 'profile-meta') {
              const meta = parseProfileMeta(messagePayload.meta)
              if (meta) {
                profileMeta = meta
              }
            } else if (messagePayload?.kind === 'profile-request') {
              profileRequest = true
            } else if (messagePayload?.kind === 'profile-update') {
              const parsed = parseProfilePayload(messagePayload.profile ?? messagePayload)
              if (parsed) {
                profilePayload = parsed
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
                if (!id || !created || !author) continue
                const imageRecord = isRecord(entry.image) ? entry.image : null
                const image =
                  imageRecord && typeof imageRecord.dataUrl === 'string'
                    ? {
                        dataUrl: imageRecord.dataUrl,
                        name: typeof imageRecord.name === 'string' ? imageRecord.name : undefined,
                        mime: typeof imageRecord.mime === 'string' ? imageRecord.mime : undefined,
                        size: typeof imageRecord.size === 'number' ? imageRecord.size : undefined,
                        width: typeof imageRecord.width === 'number' ? imageRecord.width : undefined,
                        height: typeof imageRecord.height === 'number' ? imageRecord.height : undefined
                      }
                    : undefined
                const kind = entry.kind === 'image' || image ? 'image' : 'text'
                if (!image && text.trim().length === 0) continue
                mapped.push({ id, text, createdAt: created, author, status: 'sent', kind, image })
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
              options.dmMessages.value = options.dmMessages.value.map((message) =>
                message.id === receiptTargetId ? { ...message, status: 'read' } : message
              )
              void persistHistory(contact.id, identity, options.dmMessages.value)
            }
            return
          }
          if (typingState) {
            setRemoteTyping(typingState === 'start')
            return
          }
          if (imageMeta) {
            storeImageMeta(imageMeta)
            return
          }
          if (imageChunk) {
            const message = storeImageChunk(imageChunk, 'contact')
            if (message && appendIncomingMessage(message)) {
              void persistHistory(contact.id, identity, options.dmMessages.value)
              await sendReceipt(key, encrypted.sessionId, encrypted.salt, message.id)
            }
            return
          }
          if (avatarChunk) {
            const key = `${contact.id}:${avatarChunk.hash}`
            const existing =
              avatarChunks.get(key) ?? {
                total: avatarChunk.total,
                chunks: new Array(avatarChunk.total).fill(''),
                updatedAt: avatarChunk.updatedAt
              }
            if (existing.total !== avatarChunk.total) {
              existing.total = avatarChunk.total
              existing.chunks = new Array(avatarChunk.total).fill('')
            }
            if (avatarChunk.index >= 0 && avatarChunk.index < existing.total) {
              existing.chunks[avatarChunk.index] = avatarChunk.data
            }
            if (existing.chunks.every((chunk) => chunk)) {
              const avatar = existing.chunks.join('')
              const cached = options.contactProfiles.value[contact.id] ?? loadRemoteProfile(contact.id) ?? {}
              applyRemoteProfile({
                ...cached,
                avatar,
                hash: avatarChunk.hash,
                updatedAt: avatarChunk.updatedAt ?? cached.updatedAt
              })
              avatarChunks.delete(key)
            } else {
              avatarChunks.set(key, existing)
            }
            return
          }
          if (profileMeta) {
            const cachedProfile = options.contactProfiles.value[contact.id] ?? loadRemoteProfile(contact.id)
            if (cachedProfile && !options.contactProfiles.value[contact.id]) {
              options.contactProfiles.value = { ...options.contactProfiles.value, [contact.id]: cachedProfile }
            }
            const cachedMeta = loadRemoteProfileMeta(contact.id)
            const needsProfile = !cachedProfile
            const metaChanged = !cachedMeta || cachedMeta.hash !== profileMeta.hash
            saveRemoteProfileMeta(contact.id, profileMeta)
            if ((metaChanged || needsProfile) && next.readyState === 'open') {
              await requestProfileUpdate(profileMeta, senderDeviceId)
            }
            return
          }
          if (profileRequest) {
            await sendProfileUpdate(resolveLocalProfile(), senderDeviceId)
            return
          }
          if (profilePayload) {
            applyRemoteProfile(profilePayload)
            return
          }
          if (historyResponse) {
            if (options.historySuppressed.value) return
            options.dmMessages.value = mergeHistoryMessages(options.dmMessages.value, historyResponse)
            void persistHistory(contact.id, identity, options.dmMessages.value)
            return
          }
          if (isHistoryRequest) {
            let snapshot = options.dmMessages.value
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
                author: message.author,
                kind: message.kind,
                image: message.image
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
          if (
            appendIncomingMessage({
              id: messageId,
              text: messageText,
              author: 'contact',
              createdAt,
              status: 'sent'
            })
          ) {
            void persistHistory(contact.id, identity, options.dmMessages.value)
          }
          if (receiptTargetId && options.chatSettings.value.readReceipts) {
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
          options.dmStatus.value = 'error'
          options.dmError.value = error instanceof Error ? error.message : 'Unable to decrypt message.'
        }
      }
    }

    const requestHistory = async (identity: DeviceIdentity) => {
      if (options.historySuppressed.value || historyRequested || !historyNeeded) return
      historyRequested = true
      const session = options.sessionRef.value
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
      const remoteDevice = options.remoteDeviceRef.value
      if (!remoteDevice) return
      try {
        const sessionId = createMessageId()
        const salt = randomBase64(16)
        const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
        const encrypted = await encryptPayload(key, JSON.stringify(payload), sessionId, salt, identity.deviceId)
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
      isPolite = identity.deviceId.localeCompare(remoteDevice.deviceId) > 0
      connection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      debug('created RTCPeerConnection', { remoteDeviceId: remoteDevice.deviceId })
      connection.onicecandidate = (event) => {
        if (!event.candidate) return
        debug('ice candidate', event.candidate.candidate)
        const session = options.sessionRef.value
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
      connection.oniceconnectionstatechange = () => {
        if (!connection) return
        const iceState = connection.iceConnectionState
        debug('ice connection state', iceState)
        if (iceState === 'connected' || iceState === 'completed') {
          options.dmStatus.value = 'connected'
        } else if (iceState === 'failed' || iceState === 'disconnected') {
          void scheduleReconnect(`ice-${iceState}`)
        }
      }
      connection.onsignalingstatechange = () => {
        if (!connection) return
        debug('signaling state', connection.signalingState)
      }
      connection.onicegatheringstatechange = () => {
        if (!connection) return
        debug('ice gathering state', connection.iceGatheringState)
      }
      connection.ondatachannel = (event) => {
        setupChannel(event.channel)
      }
    }

    const handleSignal = async (signal: Record<string, unknown>) => {
      const payload = isRecord(signal.payload) ? signal.payload : null
      if (!payload) return
      const payloadType = payload.type
      if (payloadType !== 'offer' && payloadType !== 'answer' && payloadType !== 'candidate') return
      debug('received signal', { type: payloadType, sessionId: signal.sessionId, fromDeviceId: signal.fromDeviceId })
      let signalKey = ''
      if (payloadType === 'candidate') {
        const candidate = isRecord(payload.candidate) ? payload.candidate : payload.candidate
        let candidateLine = isRecord(candidate) && typeof candidate.candidate === 'string' ? candidate.candidate : ''
        if (!candidateLine) {
          try {
            candidateLine = JSON.stringify(candidate)
          } catch {
            candidateLine = ''
          }
        }
        signalKey = `candidate:${candidateLine}`
      } else if (payloadType === 'offer' || payloadType === 'answer') {
        signalKey = `${payloadType}:${typeof payload.sdp === 'string' ? payload.sdp : ''}`
      }
      const sessionId = typeof signal.sessionId === 'string' ? signal.sessionId : undefined
      if (signalKey) {
        const keyed = sessionId ? `${sessionId}:${signalKey}` : signalKey
        if (handledSignals.has(keyed)) return
        handledSignals.add(keyed)
      }
      const identity = options.identityRef.value
      if (!identity) return
      const fromDeviceId = typeof signal.fromDeviceId === 'string' ? signal.fromDeviceId : undefined
      const salt = typeof payload.salt === 'string' ? payload.salt : undefined
      const remoteDevice = fromDeviceId ? await resolveDevice(fromDeviceId) : options.remoteDeviceRef.value ?? null
      if (!remoteDevice) return
      options.remoteDeviceRef.value = noSerialize(remoteDevice)
      isPolite = identity.deviceId.localeCompare(remoteDevice.deviceId) > 0
      ensurePeerConnection(identity, remoteDevice)
      if (!connection) return

      if (payloadType === 'offer' && typeof payload.sdp === 'string' && sessionId && salt) {
        const offerCollision = makingOffer || connection.signalingState !== 'stable'
        if (offerCollision && !isPolite) {
          return
        }
        const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
        options.sessionRef.value = noSerialize({
          sessionId,
          salt,
          key,
          remoteDeviceId: remoteDevice.deviceId
        })
        if (offerCollision) {
          try {
            await connection.setLocalDescription({ type: 'rollback' })
          } catch {
            // ignore rollback errors
          }
        }
        await connection.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        await flushCandidates()
        const answer = await connection.createAnswer()
        await connection.setLocalDescription(answer)
        await waitForIceGatheringComplete(connection)
        sendSignal({
          type: 'signal',
          to: contact.id,
          toDeviceId: remoteDevice.deviceId,
          sessionId,
          payload: { type: 'answer', sdp: connection.localDescription?.sdp ?? answer.sdp }
        })
        return
      }

      if (payloadType === 'answer' && typeof payload.sdp === 'string') {
        const currentSessionId = options.sessionRef.value?.sessionId
        if (sessionId && currentSessionId && sessionId !== currentSessionId) return
        if (connection.signalingState !== 'have-local-offer') return
        try {
          await connection.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
          await flushCandidates()
        } catch {
          // ignore duplicate or stale answers
        }
        return
      }

      if (payloadType === 'candidate' && payload.candidate) {
        const currentSessionId = options.sessionRef.value?.sessionId
        if (sessionId && currentSessionId && sessionId !== currentSessionId) return
        const candidate = payload.candidate as RTCIceCandidateInit
        if (!connection.remoteDescription) {
          pendingCandidates.push(candidate)
          return
        }
        try {
          await connection.addIceCandidate(candidate)
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
        debug('ws open')
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
            options.dmStatus.value = 'error'
            options.dmError.value =
              error instanceof Error
                ? error.message
                : options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Error'
          }
          return
        }
        if (payloadType === 'p2p:mailbox' && userId) {
          const deviceIds = Array.isArray((payload as { deviceIds?: unknown }).deviceIds)
            ? ((payload as { deviceIds?: unknown[] }).deviceIds ?? [])
            : []
          if (deviceIds.length && !deviceIds.includes(identity.deviceId)) return
          await pullMailbox(identity)
        }
      })
      ws.addEventListener('close', () => {
        debug('ws close')
        if (!active) return
        options.dmStatus.value = options.dmStatus.value === 'connected' ? 'offline' : options.dmStatus.value
        if (reconnectTimer !== null) return
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          connectWs(identity)
        }, 4000)
      })
      ws.addEventListener('error', () => {
        debug('ws error')
        options.dmStatus.value = 'error'
      })
    }

    const pullMailbox = async (identity: DeviceIdentity) => {
      if (mailboxPulling) {
        mailboxPullPending = true
        return
      }
      const now = Date.now()
      if (mailboxCooldownUntil > now) {
        mailboxPullPending = true
        if (mailboxTimer === null) {
          mailboxTimer = window.setTimeout(() => {
            mailboxTimer = null
            void pullMailbox(identity)
          }, mailboxCooldownUntil - now)
        }
        return
      }
      mailboxPulling = true
      try {
        const response = await fetch(buildApiUrl('/chat/p2p/mailbox/pull', window.location.origin), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deviceId: identity.deviceId, limit: 50 })
        })
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('Retry-After') ?? '2')
          const delayMs = Number.isFinite(retryAfter) ? Math.max(1, retryAfter) * 1000 : 2000
          mailboxCooldownUntil = Date.now() + delayMs
          debug('mailbox rate limited', { retryAfter: delayMs })
          mailboxPullPending = true
          return
        }
        if (!response.ok) return
        mailboxCooldownUntil = 0
        const payload = (await response.json()) as { messages?: Array<Record<string, unknown>> }
        const messages = Array.isArray(payload.messages) ? payload.messages : []
        debug('mailbox pull', { count: messages.length })
        if (!messages.length) return
        const ackIds: string[] = []
        for (const entry of messages) {
          if (!isRecord(entry)) continue
          const entryId = typeof entry.id === 'string' ? entry.id : ''
          const fromId = typeof entry.from === 'string' ? entry.from : ''
          if (fromId !== contact.id) continue
          const encrypted = resolveEncryptedPayload(entry.payload)
          if (!encrypted) continue
          const senderDeviceId = typeof encrypted.senderDeviceId === 'string' ? encrypted.senderDeviceId : undefined
          const identityDevice = options.identityRef.value
          if (!identityDevice) continue
          const deviceId = senderDeviceId ?? options.remoteDeviceRef.value?.deviceId
          if (!deviceId) continue
          const device = await resolveDevice(deviceId)
          if (!device) continue
          options.remoteDeviceRef.value = noSerialize(device)
          const key = await deriveSessionKey(
            identityDevice.privateKey,
            device.publicKey,
            decodeBase64(encrypted.salt),
            encrypted.sessionId
          )
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
            let typingState: 'start' | 'stop' | null = null
            let profileMeta: ProfileMeta | null = null
            let profilePayload: ProfilePayload | null = null
            let avatarChunk: { hash: string; updatedAt?: string; index: number; total: number; data: string } | null =
              null
            let imageMeta:
              | {
                  id: string
                  createdAt: string
                  total: number
                  name?: string
                  mime?: string
                  size?: number
                  width?: number
                  height?: number
                }
              | null = null
            let imageChunk: { id: string; index: number; total: number; data: string } | null = null
            let profileRequest = false
            let signalPayload: Record<string, unknown> | null = null
            let signalSessionId: string | undefined
            let signalTargetDeviceId: string | undefined
            try {
              const messagePayload = JSON.parse(plaintext) as {
                kind?: string
                id?: string
                text?: string
                createdAt?: string
                limit?: number
                messages?: Array<Record<string, unknown>>
                state?: string
                meta?: Record<string, unknown>
                profile?: Record<string, unknown>
                payload?: Record<string, unknown>
                sessionId?: string
                toDeviceId?: string
                hash?: string
                updatedAt?: string
                index?: number
                total?: number
                data?: string
                name?: string
                mime?: string
                size?: number
                width?: number
                height?: number
              }
              if (messagePayload?.kind === 'receipt') {
                isReceipt = true
                if (typeof messagePayload.id === 'string') {
                  receiptTargetId = messagePayload.id
                }
              } else if (messagePayload?.kind === 'typing') {
                if (messagePayload.state === 'start' || messagePayload.state === 'stop') {
                  typingState = messagePayload.state
                }
              } else if (messagePayload?.kind === 'profile-avatar-chunk') {
                const hash = typeof messagePayload.hash === 'string' ? messagePayload.hash : ''
                const index = Number(messagePayload.index)
                const total = Number(messagePayload.total)
                const data = typeof messagePayload.data === 'string' ? messagePayload.data : ''
                if (hash && Number.isFinite(index) && Number.isFinite(total) && data) {
                  avatarChunk = {
                    hash,
                    updatedAt: typeof messagePayload.updatedAt === 'string' ? messagePayload.updatedAt : undefined,
                    index,
                    total,
                    data
                  }
                }
              } else if (messagePayload?.kind === 'image-meta') {
                const id = typeof messagePayload.id === 'string' ? messagePayload.id : ''
                const total = Number(messagePayload.total)
                if (id && Number.isFinite(total) && total > 0) {
                  imageMeta = {
                    id,
                    createdAt:
                      typeof messagePayload.createdAt === 'string' ? messagePayload.createdAt : new Date().toISOString(),
                    total,
                    name: typeof messagePayload.name === 'string' ? messagePayload.name : undefined,
                    mime: typeof messagePayload.mime === 'string' ? messagePayload.mime : undefined,
                    size: typeof messagePayload.size === 'number' ? messagePayload.size : undefined,
                    width: typeof messagePayload.width === 'number' ? messagePayload.width : undefined,
                    height: typeof messagePayload.height === 'number' ? messagePayload.height : undefined
                  }
                }
              } else if (messagePayload?.kind === 'image-chunk') {
                const id = typeof messagePayload.id === 'string' ? messagePayload.id : ''
                const index = Number(messagePayload.index)
                const total = Number(messagePayload.total)
                const data = typeof messagePayload.data === 'string' ? messagePayload.data : ''
                if (id && Number.isFinite(index) && Number.isFinite(total) && data) {
                  imageChunk = { id, index, total, data }
                }
              } else if (messagePayload?.kind === 'signal') {
                if (isRecord(messagePayload.payload)) {
                  signalPayload = messagePayload.payload
                  signalSessionId = typeof messagePayload.sessionId === 'string' ? messagePayload.sessionId : undefined
                  signalTargetDeviceId =
                    typeof messagePayload.toDeviceId === 'string' ? messagePayload.toDeviceId : undefined
                }
              } else if (messagePayload?.kind === 'profile-meta') {
                const meta = parseProfileMeta(messagePayload.meta)
                if (meta) {
                  profileMeta = meta
                }
              } else if (messagePayload?.kind === 'profile-request') {
                profileRequest = true
              } else if (messagePayload?.kind === 'profile-update') {
                const parsed = parseProfilePayload(messagePayload.profile ?? messagePayload)
                if (parsed) {
                  profilePayload = parsed
                }
              } else if (messagePayload?.kind === 'history-request') {
                isHistoryRequest = true
                if (Number.isFinite(Number(messagePayload.limit))) {
                  historyLimit = Math.max(1, Math.min(historyCacheLimit, Number(messagePayload.limit)))
                }
              } else if (messagePayload?.kind === 'history-response') {
                const historyEntries = Array.isArray(messagePayload.messages) ? messagePayload.messages : []
                const mapped: DmMessage[] = []
                for (const entryMessage of historyEntries) {
                  if (!isRecord(entryMessage)) continue
                  const id = typeof entryMessage.id === 'string' ? entryMessage.id : ''
                  const text = typeof entryMessage.text === 'string' ? entryMessage.text : ''
                  const created = typeof entryMessage.createdAt === 'string' ? entryMessage.createdAt : ''
                  const author =
                    entryMessage.author === 'self' ? 'contact' : entryMessage.author === 'contact' ? 'self' : null
                  if (!id || !created || !author) continue
                  const imageRecord = isRecord(entryMessage.image) ? entryMessage.image : null
                  const image =
                    imageRecord && typeof imageRecord.dataUrl === 'string'
                      ? {
                          dataUrl: imageRecord.dataUrl,
                          name: typeof imageRecord.name === 'string' ? imageRecord.name : undefined,
                          mime: typeof imageRecord.mime === 'string' ? imageRecord.mime : undefined,
                          size: typeof imageRecord.size === 'number' ? imageRecord.size : undefined,
                          width: typeof imageRecord.width === 'number' ? imageRecord.width : undefined,
                          height: typeof imageRecord.height === 'number' ? imageRecord.height : undefined
                        }
                      : undefined
                  const kind = entryMessage.kind === 'image' || image ? 'image' : 'text'
                  if (!image && text.trim().length === 0) continue
                  mapped.push({ id, text, createdAt: created, author, status: 'sent', kind, image })
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
            if (signalPayload) {
              await handleSignal({
                payload: signalPayload,
                sessionId: signalSessionId,
                fromDeviceId: senderDeviceId,
                toDeviceId: signalTargetDeviceId
              })
              if (entryId) {
                ackIds.push(entryId)
              }
              continue
            }
            if (imageMeta) {
              storeImageMeta(imageMeta)
              if (entryId) {
                ackIds.push(entryId)
              }
              continue
            }
            if (imageChunk) {
              const message = storeImageChunk(imageChunk, 'contact')
              if (message && appendIncomingMessage(message)) {
                void persistHistory(contact.id, identityDevice, options.dmMessages.value)
                await sendReceipt(key, encrypted.sessionId, encrypted.salt, message.id)
              }
              if (entryId) {
                ackIds.push(entryId)
              }
              continue
            }
            if (profileMeta) {
              const cachedProfile = options.contactProfiles.value[contact.id] ?? loadRemoteProfile(contact.id)
              if (cachedProfile && !options.contactProfiles.value[contact.id]) {
                options.contactProfiles.value = { ...options.contactProfiles.value, [contact.id]: cachedProfile }
              }
              const cachedMeta = loadRemoteProfileMeta(contact.id)
              const needsProfile = !cachedProfile
              const metaChanged = !cachedMeta || cachedMeta.hash !== profileMeta.hash
              saveRemoteProfileMeta(contact.id, profileMeta)
              if (metaChanged || needsProfile) {
                await requestProfileUpdate(profileMeta, senderDeviceId)
              }
              if (entryId) {
                ackIds.push(entryId)
              }
              continue
            }
            if (profileRequest) {
              await sendProfileUpdate(resolveLocalProfile(), senderDeviceId)
              if (entryId) {
                ackIds.push(entryId)
              }
              continue
            }
            if (profilePayload) {
              applyRemoteProfile(profilePayload)
              if (entryId) {
                ackIds.push(entryId)
              }
              continue
            }
            if (avatarChunk) {
              const key = `${contact.id}:${avatarChunk.hash}`
              const existing =
                avatarChunks.get(key) ?? {
                  total: avatarChunk.total,
                  chunks: new Array(avatarChunk.total).fill(''),
                  updatedAt: avatarChunk.updatedAt
                }
              if (existing.total !== avatarChunk.total) {
                existing.total = avatarChunk.total
                existing.chunks = new Array(avatarChunk.total).fill('')
              }
              if (avatarChunk.index >= 0 && avatarChunk.index < existing.total) {
                existing.chunks[avatarChunk.index] = avatarChunk.data
              }
              if (existing.chunks.every((chunk) => chunk)) {
                const avatar = existing.chunks.join('')
                const cached = options.contactProfiles.value[contact.id] ?? loadRemoteProfile(contact.id) ?? {}
                applyRemoteProfile({
                  ...cached,
                  avatar,
                  hash: avatarChunk.hash,
                  updatedAt: avatarChunk.updatedAt ?? cached.updatedAt
                })
                avatarChunks.delete(key)
              } else {
                avatarChunks.set(key, existing)
              }
              if (entryId) {
                ackIds.push(entryId)
              }
              continue
            }
            if (isReceipt) {
              if (receiptTargetId) {
                options.dmMessages.value = options.dmMessages.value.map((message) =>
                  message.id === receiptTargetId ? { ...message, status: 'read' } : message
                )
                void persistHistory(contact.id, identityDevice, options.dmMessages.value)
              }
            } else if (typingState) {
              setRemoteTyping(typingState === 'start')
            } else if (historyResponse) {
              if (options.historySuppressed.value) return
              options.dmMessages.value = mergeHistoryMessages(options.dmMessages.value, historyResponse)
              void persistHistory(contact.id, identityDevice, options.dmMessages.value)
            } else if (isHistoryRequest) {
              let snapshot = options.dmMessages.value
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
                    author: message.author,
                    kind: message.kind,
                    image: message.image
                  }))
                try {
                  const responsePayload = await encryptPayload(
                    key,
                    JSON.stringify({ kind: 'history-response', messages: trimmed }),
                    encrypted.sessionId,
                    encrypted.salt,
                    identityDevice.deviceId
                  )
                  const channel = options.channelRef.value
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
              if (
                appendIncomingMessage({
                  id: messageId,
                  text: messageText,
                  author: 'contact',
                  createdAt,
                  status: 'sent'
                })
              ) {
                void persistHistory(contact.id, identityDevice, options.dmMessages.value)
              }
            }
            if (entryId) {
              ackIds.push(entryId)
            }
            if (
              !isReceipt &&
              !historyResponse &&
              !isHistoryRequest &&
              receiptTargetId &&
              options.chatSettings.value.readReceipts
            ) {
              try {
                const receipt = await encryptPayload(
                  key,
                  JSON.stringify({ kind: 'receipt', id: receiptTargetId }),
                  encrypted.sessionId,
                  encrypted.salt,
                  identityDevice.deviceId
                )
                const channel = options.channelRef.value
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
            options.dmError.value = error instanceof Error ? error.message : 'Unable to decrypt message.'
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
      } finally {
        mailboxPulling = false
        if (mailboxPullPending) {
          mailboxPullPending = false
          void pullMailbox(identity)
        }
      }
    }

    const startCaller = async (identity: DeviceIdentity, remoteDevice: ContactDevice) => {
      isPolite = identity.deviceId.localeCompare(remoteDevice.deviceId) > 0
      ensurePeerConnection(identity, remoteDevice)
      if (!connection) return
      debug('starting caller', { remoteDeviceId: remoteDevice.deviceId })
      channel = connection.createDataChannel('dm', { ordered: true })
      setupChannel(channel)
      const sessionId = createMessageId()
      const salt = randomBase64(16)
      const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
      options.sessionRef.value = noSerialize({
        sessionId,
        salt,
        key,
        remoteDeviceId: remoteDevice.deviceId
      })
      try {
        makingOffer = true
        const offer = await connection.createOffer()
        await connection.setLocalDescription(offer)
        debug('created offer')
        await waitForIceGatheringComplete(connection)
        sendSignal({
          type: 'signal',
          to: contact.id,
          toDeviceId: remoteDevice.deviceId,
          sessionId,
          payload: { type: 'offer', sdp: connection.localDescription?.sdp ?? offer.sdp, salt }
        })
      } finally {
        makingOffer = false
      }
    }

    void (async () => {
      try {
        const identity = await options.registerIdentity()
        if (!active) return
        const archiveStamp = loadHistoryArchiveStamp(contact.id)
        options.historySuppressed.value = archiveStamp !== null
        const cached = await loadHistory(contact.id, identity)
        if (!active) return
        historyNeeded = cached.length === 0 && archiveStamp === null
        if (cached.length) {
          options.dmMessages.value = cached
        }
        const nextDevices = await fetchDevices()
        if (!active) return
        if (!nextDevices.length) {
          options.dmStatus.value = 'offline'
          return
        }
        const target = pickPreferredDevice(nextDevices)
        if (!target) {
          options.dmStatus.value = 'offline'
          return
        }
        options.remoteDeviceRef.value = noSerialize(target)
        connectWs(identity)
        await pullMailbox(identity)
        await requestHistory(identity)
        const shouldInitiate = identity.deviceId.localeCompare(target.deviceId) < 0
        if (shouldInitiate) {
          await startCaller(identity, target)
        }
      } catch (error) {
        options.dmStatus.value = 'error'
        options.dmError.value = error instanceof Error ? error.message : 'Unable to start direct message.'
      }
    })()

    ctx.cleanup(() => {
      active = false
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdateEvent)
      closeConnection()
    })
  })
}

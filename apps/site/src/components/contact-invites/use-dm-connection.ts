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

    let active = true
    let devices: ContactDevice[] = []
    let connection: RTCPeerConnection | null = null
    let channel: RTCDataChannel | null = null
    let ws: WebSocket | null = null
    let reconnectTimer: number | null = null
    let mailboxPulling = false
    let mailboxPullPending = false
    let historyRequested = false
    let historyNeeded = false
    const pendingSignals: Array<Record<string, unknown>> = []

    options.dmStatus.value = 'connecting'
    options.dmMessages.value = []
    options.dmInput.value = ''
    options.dmError.value = null
    options.historySuppressed.value = false
    options.sessionRef.value = undefined

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
      options.channelRef.value = undefined
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
        options.dmStatus.value = 'connected'
        return
      }
      if (state === 'failed' || state === 'disconnected') {
        options.dmStatus.value = 'offline'
      }
    }

    const appendIncomingMessage = (message: DmMessage) => {
      if (options.dmMessages.value.some((entry) => entry.id === message.id)) return false
      options.dmMessages.value = [...options.dmMessages.value, message]
      return true
    }

    const setupChannel = (next: RTCDataChannel) => {
      channel = next
      options.channelRef.value = noSerialize(next)
      next.onopen = () => {
        options.dmStatus.value = 'connected'
        if (options.chatSettings.value.typingIndicators && options.dmInput.value.trim()) {
          void options.sendTyping('start')
        }
      }
      next.onclose = () => {
        options.dmStatus.value = 'offline'
      }
      next.onerror = () => {
        options.dmStatus.value = 'error'
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
          try {
            const messagePayload = JSON.parse(plaintext) as {
              kind?: string
              id?: string
              text?: string
              createdAt?: string
              limit?: number
              messages?: Array<Record<string, unknown>>
              state?: string
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
      connection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      connection.onicecandidate = (event) => {
        if (!event.candidate) return
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
      connection.ondatachannel = (event) => {
        setupChannel(event.channel)
      }
    }

    const handleSignal = async (signal: Record<string, unknown>) => {
      const payload = isRecord(signal.payload) ? signal.payload : null
      if (!payload) return
      const payloadType = payload.type
      if (payloadType !== 'offer' && payloadType !== 'answer' && payloadType !== 'candidate') return
      const identity = options.identityRef.value
      if (!identity) return
      const fromDeviceId = typeof signal.fromDeviceId === 'string' ? signal.fromDeviceId : undefined
      const sessionId = typeof signal.sessionId === 'string' ? signal.sessionId : undefined
      const salt = typeof payload.salt === 'string' ? payload.salt : undefined
      const remoteDevice = fromDeviceId ? await resolveDevice(fromDeviceId) : options.remoteDeviceRef.value ?? null
      if (!remoteDevice) return
      options.remoteDeviceRef.value = noSerialize(remoteDevice)
      ensurePeerConnection(identity, remoteDevice)
      if (!connection) return

      if (payloadType === 'offer' && typeof payload.sdp === 'string' && sessionId && salt) {
        const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
        options.sessionRef.value = noSerialize({
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
            options.dmStatus.value = 'error'
            options.dmError.value =
              error instanceof Error
                ? error.message
                : options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Error'
          }
          return
        }
        if (payloadType === 'p2p:mailbox' && userId) {
          await pullMailbox(identity)
        }
      })
      ws.addEventListener('close', () => {
        if (!active) return
        options.dmStatus.value = options.dmStatus.value === 'connected' ? 'offline' : options.dmStatus.value
        if (reconnectTimer !== null) return
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          connectWs(identity)
        }, 4000)
      })
      ws.addEventListener('error', () => {
        options.dmStatus.value = 'error'
      })
    }

    const pullMailbox = async (identity: DeviceIdentity) => {
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
          options.sessionRef.value = noSerialize({
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
            let typingState: 'start' | 'stop' | null = null
            try {
              const messagePayload = JSON.parse(plaintext) as {
                kind?: string
                id?: string
                text?: string
                createdAt?: string
                limit?: number
                messages?: Array<Record<string, unknown>>
                state?: string
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
            if (typeof entry.id === 'string') {
              ackIds.push(entry.id)
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
      ensurePeerConnection(identity, remoteDevice)
      if (!connection) return
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
        await startCaller(identity, target)
      } catch (error) {
        options.dmStatus.value = 'error'
        options.dmError.value = error instanceof Error ? error.message : 'Unable to start direct message.'
      }
    })()

    ctx.cleanup(() => {
      active = false
      closeConnection()
    })
  })
}

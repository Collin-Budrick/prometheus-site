import { $, type NoSerialize, type Signal } from '@builder.io/qwik'
import type { ChatSettings } from '../../shared/chat-settings'
import {
  decodeBase64,
  deriveSessionKey,
  encryptPayload,
  randomBase64,
  type DeviceIdentity
} from '../../shared/p2p-crypto'
import { buildApiUrl } from './api'
import { persistHistory } from './history'
import { createMessageId, isRecord } from './utils'
import type { ActiveContact, ContactDevice, DmMessage, P2pSession } from './types'

type DmComposerOptions = {
  activeContact: Signal<ActiveContact | null>
  dmInput: Signal<string>
  dmMessages: Signal<DmMessage[]>
  dmError: Signal<string | null>
  chatSettings: Signal<ChatSettings>
  typingActive: Signal<boolean>
  typingTimer: Signal<number | null>
  identityRef: Signal<NoSerialize<DeviceIdentity> | undefined>
  sessionRef: Signal<NoSerialize<P2pSession> | undefined>
  channelRef: Signal<NoSerialize<RTCDataChannel> | undefined>
  remoteDeviceRef: Signal<NoSerialize<ContactDevice> | undefined>
  fragmentCopy: Signal<Record<string, string>>
}

export const useDmComposer = (options: DmComposerOptions) => {
  const maxImageBytes = 2_000_000
  const imageChunkSize = 12_000

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Unable to read image.'))
      reader.readAsDataURL(file)
    })

  const resolveImageSize = (dataUrl: string) =>
    new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => resolve(null)
      image.src = dataUrl
    })

  const sendEncryptedPayload = async (
    session: P2pSession,
    identity: DeviceIdentity,
    payload: Record<string, unknown>
  ) => {
    const encrypted = await encryptPayload(
      session.key,
      JSON.stringify(payload),
      session.sessionId,
      session.salt,
      identity.deviceId
    )
    const channel = options.channelRef.value
    if (!channel || channel.readyState !== 'open') {
      throw new Error('Channel unavailable')
    }
    channel.send(JSON.stringify({ type: 'message', payload: encrypted }))
  }

  const sendTyping = $(async (state: 'start' | 'stop') => {
    if (typeof window === 'undefined') return
    if (!options.chatSettings.value.typingIndicators) return
    const identity = options.identityRef.value
    const contact = options.activeContact.value
    if (!identity || !contact) return
    const channel = options.channelRef.value
    const session = options.sessionRef.value
    const payloadText = JSON.stringify({ kind: 'typing', state })
    if (channel && channel.readyState === 'open' && session) {
      try {
        const payload = await encryptPayload(
          session.key,
          payloadText,
          session.sessionId,
          session.salt,
          identity.deviceId
        )
        channel.send(JSON.stringify({ type: 'message', payload }))
      } catch {
        // ignore typing failures
      }
      return
    }
    const remoteDevice = options.remoteDeviceRef.value
    if (!session && !remoteDevice) return
    try {
      let fallbackSession: P2pSession | null = session ?? null
      if (!fallbackSession && remoteDevice) {
        const sessionId = createMessageId()
        const salt = randomBase64(16)
        const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
        fallbackSession = { sessionId, salt, key, remoteDeviceId: remoteDevice.deviceId }
      }
      if (!fallbackSession) return
      const payload = await encryptPayload(
        fallbackSession.key,
        payloadText,
        fallbackSession.sessionId,
        fallbackSession.salt,
        identity.deviceId
      )
      await fetch(buildApiUrl('/chat/p2p/mailbox/send', window.location.origin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipientId: contact.id, payload })
      })
    } catch {
      // ignore typing failures
    }
  })

  const handleDmInput = $((event: Event) => {
    const target = event.target as HTMLInputElement | null
    options.dmInput.value = target?.value ?? ''
    if (!options.chatSettings.value.typingIndicators || typeof window === 'undefined') return
    const hasText = options.dmInput.value.trim().length > 0
    if (hasText && !options.typingActive.value) {
      options.typingActive.value = true
      void sendTyping('start')
    }
    if (!hasText && options.typingActive.value) {
      options.typingActive.value = false
      void sendTyping('stop')
    }
    if (options.typingTimer.value !== null) {
      window.clearTimeout(options.typingTimer.value)
    }
    if (hasText) {
      options.typingTimer.value = window.setTimeout(() => {
        options.typingTimer.value = null
        if (options.typingActive.value) {
          options.typingActive.value = false
          void sendTyping('stop')
        }
      }, 1600)
    } else {
      options.typingTimer.value = null
    }
  })

  const handleDmKeyDown = $((event: KeyboardEvent) => {
    if (!options.chatSettings.value.typingIndicators || typeof window === 'undefined') return
    if (event.isComposing) return
    if (event.key.length !== 1) return
    if (!options.typingActive.value) {
      options.typingActive.value = true
      void sendTyping('start')
    }
  })

  const handleDmSubmit = $(async () => {
    if (typeof window === 'undefined') return
    const contact = options.activeContact.value
    const text = options.dmInput.value.trim()
    if (!contact || !text) return
    const messageId = createMessageId()
    const createdAt = new Date().toISOString()
    const identity = options.identityRef.value

    options.dmInput.value = ''
    options.dmError.value = null
    if (options.typingTimer.value !== null) {
      window.clearTimeout(options.typingTimer.value)
      options.typingTimer.value = null
    }
    if (options.typingActive.value) {
      options.typingActive.value = false
      void sendTyping('stop')
    }
    options.dmMessages.value = [
      ...options.dmMessages.value,
      { id: messageId, text, author: 'self', createdAt, status: 'pending' }
    ]
    if (identity) {
      void persistHistory(contact.id, identity, options.dmMessages.value)
    }

    try {
      const channel = options.channelRef.value
      const session = options.sessionRef.value
      if (channel && channel.readyState === 'open' && session && identity) {
        const payload = await encryptPayload(
          session.key,
          JSON.stringify({ kind: 'message', id: messageId, text, createdAt }),
          session.sessionId,
          session.salt,
          identity.deviceId
        )
        channel.send(JSON.stringify({ type: 'message', payload }))
        options.dmMessages.value = options.dmMessages.value.map((message) =>
          message.id === messageId ? { ...message, status: 'sent' } : message
        )
        void persistHistory(contact.id, identity, options.dmMessages.value)
        return
      }

      const remoteDevice = options.remoteDeviceRef.value
      if (!identity || !remoteDevice) {
        options.dmMessages.value = options.dmMessages.value.map((message) =>
          message.id === messageId ? { ...message, status: 'failed' } : message
        )
        options.dmError.value =
          options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
        if (identity) {
          void persistHistory(contact.id, identity, options.dmMessages.value)
        }
        return
      }

      const sessionId = createMessageId()
      const salt = randomBase64(16)
      const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
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

      options.dmMessages.value = options.dmMessages.value.map((message) =>
        message.id === messageId ? { ...message, status: response.ok ? 'queued' : 'failed' } : message
      )
      void persistHistory(contact.id, identity, options.dmMessages.value)
      if (!response.ok) {
        let errorMessage = options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
        try {
          const payload: unknown = await response.json()
          if (isRecord(payload) && typeof payload.error === 'string') {
            errorMessage = payload.error
          }
        } catch {
          // ignore parse errors
        }
        options.dmError.value = errorMessage
      }
    } catch (error) {
      options.dmMessages.value = options.dmMessages.value.map((message) =>
        message.id === messageId ? { ...message, status: 'failed' } : message
      )
      if (identity) {
        void persistHistory(contact.id, identity, options.dmMessages.value)
      }
      options.dmError.value =
        error instanceof Error
          ? error.message
          : options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
    }
  })

  const handleDmImage = $(async (event: Event) => {
    if (typeof window === 'undefined') return
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0]
    if (input) input.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      options.dmError.value = 'Please choose an image file.'
      return
    }
    if (file.size > maxImageBytes) {
      options.dmError.value = 'Image too large.'
      return
    }
    const contact = options.activeContact.value
    const identity = options.identityRef.value
    const session = options.sessionRef.value
    const channel = options.channelRef.value
    if (!contact || !identity || !session || !channel || channel.readyState !== 'open') {
      options.dmError.value =
        options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
      return
    }
    options.dmError.value = null
    const messageId = createMessageId()
    const createdAt = new Date().toISOString()
    let dataUrl: string
    try {
      dataUrl = await readFileAsDataUrl(file)
    } catch (error) {
      options.dmError.value = error instanceof Error ? error.message : 'Unable to read image.'
      return
    }
    if (!dataUrl) {
      options.dmError.value = 'Unable to read image.'
      return
    }
    const [, base64Raw = ''] = dataUrl.split(',', 2)
    if (!base64Raw) {
      options.dmError.value = 'Unable to read image.'
      return
    }
    const dimensions = await resolveImageSize(dataUrl)
    options.dmMessages.value = [
      ...options.dmMessages.value,
      {
        id: messageId,
        text: '',
        author: 'self',
        createdAt,
        status: 'pending',
        kind: 'image',
        image: {
          dataUrl,
          name: file.name || undefined,
          mime: file.type || undefined,
          width: dimensions?.width,
          height: dimensions?.height,
          size: file.size
        }
      }
    ]
    try {
      const total = Math.ceil(base64Raw.length / imageChunkSize)
      await sendEncryptedPayload(session, identity, {
        kind: 'image-meta',
        id: messageId,
        createdAt,
        name: file.name || undefined,
        mime: file.type || undefined,
        size: file.size,
        width: dimensions?.width,
        height: dimensions?.height,
        total
      })
      for (let index = 0; index < total; index += 1) {
        const data = base64Raw.slice(index * imageChunkSize, (index + 1) * imageChunkSize)
        await sendEncryptedPayload(session, identity, {
          kind: 'image-chunk',
          id: messageId,
          index,
          total,
          data
        })
      }
      options.dmMessages.value = options.dmMessages.value.map((message) =>
        message.id === messageId ? { ...message, status: 'sent' } : message
      )
      void persistHistory(contact.id, identity, options.dmMessages.value)
    } catch (error) {
      options.dmMessages.value = options.dmMessages.value.map((message) =>
        message.id === messageId ? { ...message, status: 'failed' } : message
      )
      void persistHistory(contact.id, identity, options.dmMessages.value)
      options.dmError.value =
        error instanceof Error
          ? error.message
          : options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
    }
  })

  return {
    sendTyping,
    handleDmInput,
    handleDmKeyDown,
    handleDmSubmit,
    handleDmImage
  }
}

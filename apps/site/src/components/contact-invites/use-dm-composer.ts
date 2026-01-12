import { $, type NoSerialize, type Signal } from '@builder.io/qwik'
import type { ChatSettings } from '../../shared/chat-settings'
import {
  encryptPayload,
  encryptPayloadBinary,
  encodeBinaryEnvelope,
  type DeviceIdentity
} from '../../shared/p2p-crypto'
import { zstdCompress } from '../../shared/zstd-codec'
import { enqueueOutboxItem } from './outbox'
import { persistHistory } from './history'
import { createMessageId } from './utils'
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
  const readBlobAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Unable to read image.'))
      reader.readAsDataURL(blob)
    })

  const encodeBase64 = (bytes: Uint8Array) => {
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }

  const encodeBinaryMessage = (header: Record<string, unknown>, data: Uint8Array) => {
    const headerBytes = new TextEncoder().encode(JSON.stringify(header))
    if (headerBytes.length > 65_535) {
      throw new Error('Image header too large.')
    }
    const buffer = new Uint8Array(2 + headerBytes.length + data.length)
    const view = new DataView(buffer.buffer)
    view.setUint16(0, headerBytes.length)
    buffer.set(headerBytes, 2)
    buffer.set(data, 2 + headerBytes.length)
    return buffer
  }

  const createCanvas = (width: number, height: number) => {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  const encodeCanvas = async (canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality: number) => {
    if ('convertToBlob' in canvas) {
      return (canvas as OffscreenCanvas).convertToBlob({ type, quality })
    }
    return new Promise<Blob | null>((resolve) => {
      ;(canvas as HTMLCanvasElement).toBlob(resolve, type, quality)
    })
  }

  const swapExtension = (name: string, extension: string) => {
    const safeName = name || 'image'
    const dotIndex = safeName.lastIndexOf('.')
    const base = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName
    return `${base}.${extension}`
  }

  const reencodeImage = async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file)
      const width = bitmap.width
      const height = bitmap.height
      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d', { alpha: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null
      if (!ctx) {
        bitmap.close?.()
        return { blob: file, mime: file.type || 'image/png', name: file.name || 'image.png', width, height }
      }
      ctx.drawImage(bitmap, 0, 0, width, height)
      bitmap.close?.()
      const candidates: Array<{ blob: Blob; mime: string; name: string }> = []
      const avifBlob = await encodeCanvas(canvas, 'image/avif', 0.72)
      if (avifBlob) {
        candidates.push({ blob: avifBlob, mime: 'image/avif', name: swapExtension(file.name, 'avif') })
      }
      const webpBlob = await encodeCanvas(canvas, 'image/webp', 0.82)
      if (webpBlob) {
        candidates.push({ blob: webpBlob, mime: 'image/webp', name: swapExtension(file.name, 'webp') })
      }
      const fallbackMime = file.type || 'image/png'
      candidates.push({ blob: file, mime: fallbackMime, name: file.name || `image.${fallbackMime.split('/')[1] ?? 'png'}` })
      candidates.sort((a, b) => a.blob.size - b.blob.size)
      const chosen = candidates[0]
      return { blob: chosen.blob, mime: chosen.mime, name: chosen.name, width, height }
    } catch {
      return { blob: file, mime: file.type || 'image/png', name: file.name || 'image.png', width: 0, height: 0 }
    }
  }

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
    if (!channel || channel.readyState !== 'open' || !session) return
    try {
      const payload = await encryptPayload(
        session.key,
        JSON.stringify({ kind: 'typing', state }),
        session.sessionId,
        session.salt,
        identity.deviceId
      )
      channel.send(JSON.stringify({ type: 'message', payload }))
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

      if (!identity) {
        options.dmMessages.value = options.dmMessages.value.map((message) =>
          message.id === messageId ? { ...message, status: 'failed' } : message
        )
        options.dmError.value =
          options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
        void persistHistory(contact.id, identity, options.dmMessages.value)
        return
      }
      const queued = await enqueueOutboxItem(contact.id, identity, {
        id: messageId,
        kind: 'text',
        createdAt,
        text
      })
      options.dmMessages.value = options.dmMessages.value.map((message) =>
        message.id === messageId ? { ...message, status: queued ? 'queued' : 'failed' } : message
      )
      void persistHistory(contact.id, identity, options.dmMessages.value)
      if (!queued) {
        options.dmError.value =
          options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
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
    const contact = options.activeContact.value
    const identity = options.identityRef.value
    const session = options.sessionRef.value
    const channel = options.channelRef.value
    if (!contact || !identity) {
      options.dmError.value =
        options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
      return
    }
    options.dmError.value = null
    const messageId = createMessageId()
    const createdAt = new Date().toISOString()
    let dataUrl: string
    let payloadBytes = new Uint8Array()
    let payloadMime = file.type || 'image/png'
    let payloadName = file.name || 'image.png'
    let payloadSize = file.size
    let width = 0
    let height = 0
    let encoding: 'zstd' | 'none' = 'none'
    try {
      const reencoded = await reencodeImage(file)
      payloadMime = reencoded.mime
      payloadName = reencoded.name
      payloadSize = reencoded.blob.size
      width = reencoded.width
      height = reencoded.height
      dataUrl = await readBlobAsDataUrl(reencoded.blob)
      const rawBytes = new Uint8Array(await reencoded.blob.arrayBuffer())
      const compressed = await zstdCompress(rawBytes, 15)
      if (compressed && compressed.byteLength < rawBytes.byteLength) {
        payloadBytes = Uint8Array.from(compressed)
        encoding = 'zstd'
      } else {
        payloadBytes = rawBytes
      }
    } catch (error) {
      options.dmError.value = error instanceof Error ? error.message : 'Unable to read image.'
      return
    }
    if (!dataUrl) {
      options.dmError.value = 'Unable to read image.'
      return
    }
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
          name: payloadName || undefined,
          mime: payloadMime || undefined,
          width: width || undefined,
          height: height || undefined,
          size: payloadSize
        }
      }
    ]
    try {
      const channelChunkSize = 32_000
      const channelTotal = Math.max(1, Math.ceil(payloadBytes.length / channelChunkSize))
      if (channel && channel.readyState === 'open' && session) {
        await sendEncryptedPayload(session, identity, {
          kind: 'image-meta',
          id: messageId,
          createdAt,
          name: payloadName || undefined,
          mime: payloadMime || undefined,
          size: payloadSize,
          width: width || undefined,
          height: height || undefined,
          total: channelTotal,
          encoding: encoding === 'zstd' ? 'zstd' : undefined
        })
        for (let index = 0; index < channelTotal; index += 1) {
          const start = index * channelChunkSize
          const end = Math.min(payloadBytes.length, start + channelChunkSize)
          const data = payloadBytes.slice(start, end)
          const envelope = encodeBinaryEnvelope(
            await encryptPayloadBinary(
              session.key,
              encodeBinaryMessage({ kind: 'image-chunk-bin', id: messageId, index, total: channelTotal }, data)
            )
          )
          channel.send(envelope)
        }
        options.dmMessages.value = options.dmMessages.value.map((message) =>
          message.id === messageId ? { ...message, status: 'sent' } : message
        )
        void persistHistory(contact.id, identity, options.dmMessages.value)
        return
      }

      const base64Raw = encodeBase64(payloadBytes)
      if (!base64Raw) {
        options.dmError.value = 'Unable to read image.'
        return
      }
      const queued = await enqueueOutboxItem(contact.id, identity, {
        id: messageId,
        kind: 'image',
        createdAt,
        payloadBase64: base64Raw,
        encoding: encoding === 'zstd' ? 'zstd' : undefined,
        name: payloadName || undefined,
        mime: payloadMime || undefined,
        size: payloadSize,
        width: width || undefined,
        height: height || undefined
      })
      options.dmMessages.value = options.dmMessages.value.map((message) =>
        message.id === messageId ? { ...message, status: queued ? 'queued' : 'failed' } : message
      )
      void persistHistory(contact.id, identity, options.dmMessages.value)
      if (!queued) {
        options.dmError.value =
          options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Unable to deliver message.'
      }
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

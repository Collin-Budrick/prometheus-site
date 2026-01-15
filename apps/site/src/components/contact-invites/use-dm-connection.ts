import { noSerialize, useVisibleTask$, type NoSerialize, type QRL, type Signal } from '@builder.io/qwik'
import { Peer, type DataConnection, type PeerJSOption } from 'peerjs'
import type { ChatSettings } from '../../shared/chat-settings'
import { appConfig } from '../../app-config'
import {
  decodeBase64,
  encodeBinaryEnvelope,
  decodeBinaryEnvelope,
  decryptPayload,
  decryptPayloadBinary,
  deriveSessionKey,
  encryptPayload,
  encryptPayloadBinary,
  randomBase64,
  type EncryptedPayload,
  type DeviceIdentity
} from '../../shared/p2p-crypto'
import { zstdDecompress } from '../../shared/zstd-codec'
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
import { loadOutbox, removeOutboxItems, saveOutbox, type OutboxItem } from './outbox'
import { decryptSignalPayload, encryptSignalPayload, resolveSignalEnvelope, type SignalEnvelope } from './signal'
import {
  buildCrdtRoomName,
  destroyCrdtProvider,
  ensureCrdtProvider,
  isCrdtSignalingBackoff,
  resetCrdtProvider
} from './crdt-provider'
import {
  historyCacheLimit,
  historyRequestLimit,
  loadHistory,
  loadHistoryArchiveStamp,
  mergeHistoryMessages,
  persistHistory
} from './history'
import { ensureReplicationKey, loadReplicationKey, setReplicationKey } from './crdt-store'
import { createMessageId, isRecord, pickPreferredDevice, resolveEncryptedPayload } from './utils'
import { fetchRelayDevices } from './relay-directory'
import { createRelayManager, type RelayMessage } from './relay'
import { getServerBackoffMs, markServerFailure, markServerSuccess, shouldAttemptServer } from '../../shared/server-backoff'
import { shouldSkipMessagingServer } from './relay-mode'
import type { ActiveContact, ContactDevice, DmConnectionState, DmDataChannel, DmMessage, P2pSession } from './types'

type DmConnectionOptions = {
  activeContact: Signal<ActiveContact | null>
  dmMessages: Signal<DmMessage[]>
  dmInput: Signal<string>
  dmStatus: Signal<DmConnectionState>
  dmError: Signal<string | null>
  deviceListStaleAt: Signal<string | null>
  channelRef: Signal<NoSerialize<DmDataChannel> | undefined>
  identityRef: Signal<NoSerialize<DeviceIdentity> | undefined>
  sessionRef: Signal<NoSerialize<P2pSession> | undefined>
  remoteDeviceRef: Signal<NoSerialize<ContactDevice> | undefined>
  localProfile: Signal<ProfilePayload | null>
  contactProfiles: Signal<Record<string, ProfilePayload>>
  chatSettings: Signal<ChatSettings>
  selfUserId: Signal<string | undefined>
  remoteTyping: Signal<boolean>
  remoteTypingTimer: Signal<number | null>
  incomingImageCount: Signal<number>
  historySuppressed: Signal<boolean>
  fragmentCopy: Signal<Record<string, string>>
  registerIdentity: QRL<() => Promise<DeviceIdentity>>
  sendTyping: QRL<(state: 'start' | 'stop') => Promise<void>>
}

type PayloadContext = {
  source: 'contact' | 'self'
  author: 'contact' | 'self'
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
      options.deviceListStaleAt.value = null
      options.incomingImageCount.value = 0
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
    let selfDevices: ContactDevice[] = []
    let selfDevicesFetchedAt = 0
    let connection: RTCPeerConnection | null = null
    let channel: DmDataChannel | null = null
    let ws: WebSocket | null = null
    let peerJs: Peer | null = null
    let peerJsConnecting = false
    let peerJsFallbackActive = false
    let wsHealthy = true
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let reconnecting = false
    let wsReconnectTimer: number | null = null
    let wsReconnectAttempt = 0
    let wsReconnectPending = false
    let wsHeartbeatTimer: number | null = null
    let wsPongTimer: number | null = null
    let deviceRetryTimer: number | null = null
    let deviceRetryAttempt = 0
    let iceRestarting = false
    let iceRestartAttempts = 0
    let isPolite = false
    let makingOffer = false
    let flushingOutbox = false
    let historyRequested = false
    let historyNeeded = false
    let mailboxPulling = false
    let relayManager: ReturnType<typeof createRelayManager> | null = null
    let relayManagerKey = ''
    let selfRelayManager: ReturnType<typeof createRelayManager> | null = null
    let selfRelayManagerKey = ''
    const outboxResendIntervalMs = 15_000
    const wsHeartbeatIntervalMs = 12_000
    const wsHeartbeatTimeoutMs = 6_000
    const offerTimeoutMs = 15_000
    const resolvedIceServers =
      appConfig.p2pIceServers && appConfig.p2pIceServers.length
        ? appConfig.p2pIceServers
        : [{ urls: 'stun:stun.l.google.com:19302' }]
    const peerJsEnabled = Boolean(appConfig.p2pPeerjsServer)
    const avatarChunkSize = 12_000
    const selfSyncInlineLimitBytes = 240_000
    const incomingImageIds = new Set<string>()
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
          encoding?: 'zstd'
        }
      }
    >()
    const binaryImageChunks = new Map<
      string,
      {
        total: number
        chunks: Array<Uint8Array | null>
      }
    >()
    const pendingSignals: Array<Record<string, unknown>> = []
    const pendingCandidates: RTCIceCandidateInit[] = []
    const handledSignals = new Set<string>()
    const offerTimeouts = new Map<string, number>()
    const debug = (...args: unknown[]) => {
      if (typeof window === 'undefined') return
      if (window.localStorage?.getItem('p2pDebug') !== '1') return
      console.info('[p2p]', ...args)
    }
    const resolveRelayIdentity = (identity: DeviceIdentity) => {
      if (!identity.relayPublicKey || !identity.relaySecretKey) return undefined
      return { publicKey: identity.relayPublicKey, secretKey: identity.relaySecretKey }
    }
    const resolveServerKey = () => {
      const wsUrl = buildWsUrl('/chat/p2p/ws', window.location.origin)
      if (wsUrl) {
        try {
          return new URL(wsUrl).host
        } catch {
          // fall back to window host
        }
      }
      return window.location.host
    }
    const serverKey = resolveServerKey()
    const skipServer = shouldSkipMessagingServer()
    const buildDeviceCacheKey = (contactId: string) => `p2pDevices:${contactId}`
    const loadDeviceCache = (contactId: string) => {
      try {
        const raw = window.localStorage?.getItem(buildDeviceCacheKey(contactId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as { devices?: ContactDevice[]; updatedAt?: string }
        if (!Array.isArray(parsed.devices)) return null
        const devices = parsed.devices.filter((device) => device?.deviceId)
        const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
        if (!updatedAt) return null
        return { devices, updatedAt }
      } catch {
        return null
      }
    }
    const saveDeviceCache = (contactId: string, nextDevices: ContactDevice[]) => {
      try {
        const payload = JSON.stringify({ devices: nextDevices, updatedAt: new Date().toISOString() })
        window.localStorage?.setItem(buildDeviceCacheKey(contactId), payload)
      } catch {
        // ignore cache failures
      }
    }
    const buildLocalDeviceEntry = (identity: DeviceIdentity, relayUrls?: string[]): ContactDevice => {
      const label = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 64) : undefined
      return {
        deviceId: identity.deviceId,
        publicKey: identity.publicKeyJwk,
        label: label || undefined,
        role: identity.role,
        relayPublicKey: identity.relayPublicKey || undefined,
        relayUrls: relayUrls?.length ? relayUrls : undefined,
        updatedAt: new Date().toISOString()
      }
    }
    const mergeDeviceLists = (...lists: ContactDevice[][]) => {
      const byId = new Map<string, ContactDevice>()
      for (const list of lists) {
        for (const device of list) {
          if (!device?.deviceId) continue
          const existing = byId.get(device.deviceId)
          if (!existing) {
            byId.set(device.deviceId, device)
            continue
          }
          const nextUpdated = device.updatedAt ? Date.parse(device.updatedAt) : Number.NaN
          const prevUpdated = existing.updatedAt ? Date.parse(existing.updatedAt) : Number.NaN
          if (Number.isFinite(nextUpdated) && (!Number.isFinite(prevUpdated) || nextUpdated > prevUpdated)) {
            byId.set(device.deviceId, device)
          }
        }
      }
      return Array.from(byId.values())
    }
    const resolveDiscoveredRelays = () => {
      const discovered = new Set<string>()
      for (const device of devices) {
        const urls = device.relayUrls ?? []
        for (const url of urls) {
          if (url) discovered.add(url)
        }
      }
      const remoteUrls = options.remoteDeviceRef.value?.relayUrls ?? []
      for (const url of remoteUrls) {
        if (url) discovered.add(url)
      }
      return Array.from(discovered)
    }
    const resolveAdvertisedRelays = () => {
      const configured = [
        ...(appConfig.p2pRelayBases ?? []),
        ...(appConfig.p2pNostrRelays ?? []),
        ...(appConfig.p2pWakuRelays ?? [])
      ]
      return Array.from(new Set([...configured, ...resolveDiscoveredRelays()])).filter(Boolean)
    }
    const buildRelayManagerKey = (identity: DeviceIdentity, remoteDevice: ContactDevice | undefined) => {
      const discovered = resolveDiscoveredRelays().slice().sort().join(',')
      const relayKey = identity.relayPublicKey ?? ''
      const recipientKey = remoteDevice?.relayPublicKey ?? ''
      return `${relayKey}|${recipientKey}|${discovered}`
    }
    const getRelayManager = () => {
      if (typeof window === 'undefined') return null
      const identity = options.identityRef.value
      if (!identity) return null
      const remoteDevice = options.remoteDeviceRef.value ?? undefined
      const nextKey = buildRelayManagerKey(identity, remoteDevice)
      if (!relayManager || nextKey !== relayManagerKey) {
        relayManagerKey = nextKey
        relayManager = createRelayManager(window.location.origin, {
          relayIdentity: resolveRelayIdentity(identity),
          recipientRelayKey: remoteDevice?.relayPublicKey,
          discoveredRelays: resolveDiscoveredRelays()
        })
      }
      return relayManager
    }
    const selfDevicesCacheMs = 30_000
    const fetchSelfDevices = async () => {
      const selfUserId = options.selfUserId.value
      if (!selfUserId) return []
      const now = Date.now()
      if (selfDevices.length && now - selfDevicesFetchedAt < selfDevicesCacheMs) {
        return selfDevices
      }
      const relayUrls = resolveAdvertisedRelays()
      let relayDevices: ContactDevice[] = []
      try {
        relayDevices = await fetchRelayDevices({ userId: selfUserId, relayUrls })
      } catch {
        relayDevices = []
      }
      let apiDevices: ContactDevice[] = []
      if (!relayDevices.length && !skipServer && shouldAttemptServer(serverKey)) {
        try {
          const response = await fetch(
            buildApiUrl(`/chat/p2p/devices/${encodeURIComponent(selfUserId)}`, window.location.origin),
            { credentials: 'include' }
          )
          if (response.ok) {
            const payload = (await response.json()) as { devices?: ContactDevice[] }
            apiDevices = Array.isArray(payload.devices) ? payload.devices.filter((device) => device.deviceId) : []
            markServerSuccess(serverKey)
          } else if (response.status >= 500) {
            markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
          }
        } catch {
          markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
          // ignore API failures
        }
      }
      const identity = options.identityRef.value
      const localEntry = identity ? buildLocalDeviceEntry(identity, resolveAdvertisedRelays()) : null
      const next = mergeDeviceLists(apiDevices, relayDevices, localEntry ? [localEntry] : [])
      if (next.length) {
        selfDevices = next
        selfDevicesFetchedAt = now
        return next
      }
      return selfDevices
    }
    const resolveSelfDevice = async (deviceId: string) => {
      let device = selfDevices.find((entry) => entry.deviceId === deviceId)
      if (device) return device
      await fetchSelfDevices()
      device = selfDevices.find((entry) => entry.deviceId === deviceId)
      return device ?? null
    }
    const getSelfRelayManager = async () => {
      if (typeof window === 'undefined') return null
      const identity = options.identityRef.value
      if (!identity) return null
      const devices = await fetchSelfDevices()
      const discovered = Array.from(
        new Set(
          devices
            .flatMap((device) => device.relayUrls ?? [])
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      )
      const nextKey = `${identity.relayPublicKey ?? ''}|${discovered.slice().sort().join(',')}`
      if (!selfRelayManager || nextKey !== selfRelayManagerKey) {
        selfRelayManagerKey = nextKey
        selfRelayManager = createRelayManager(window.location.origin, {
          relayIdentity: resolveRelayIdentity(identity),
          discoveredRelays: discovered
        })
      }
      return selfRelayManager
    }
    const reportDmError = (message: string, fallbackStatus: 'error' | 'offline' = 'error') => {
      options.dmError.value = message
      const activeChannel = options.channelRef.value ?? channel
      const channelOpen = activeChannel?.readyState === 'open'
      const connectionState = connection?.connectionState
      const iceState = connection?.iceConnectionState
      if (
        options.dmStatus.value === 'connected' ||
        channelOpen ||
        connectionState === 'connected' ||
        iceState === 'connected' ||
        iceState === 'completed'
      ) {
        options.dmStatus.value = 'connected'
        return
      }
      options.dmStatus.value = fallbackStatus
    }

    options.dmStatus.value = 'connecting'
    options.dmMessages.value = []
    options.dmInput.value = ''
    options.dmError.value = null
    options.incomingImageCount.value = 0
    options.historySuppressed.value = false
    options.sessionRef.value = undefined

    const closeConnection = () => {
      debug('closing dm connection')
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (wsReconnectTimer !== null) {
        window.clearTimeout(wsReconnectTimer)
        wsReconnectTimer = null
      }
      if (wsHeartbeatTimer !== null) {
        window.clearInterval(wsHeartbeatTimer)
        wsHeartbeatTimer = null
      }
      if (wsPongTimer !== null) {
        window.clearTimeout(wsPongTimer)
        wsPongTimer = null
      }
      if (deviceRetryTimer !== null) {
        window.clearTimeout(deviceRetryTimer)
        deviceRetryTimer = null
      }
      clearOfferTimeouts()
      reconnecting = false
      reconnectAttempt = 0
      wsReconnectAttempt = 0
      wsReconnectPending = false
      iceRestarting = false
      iceRestartAttempts = 0
      clearPendingSignals()
      if (channel) {
        channel.close?.()
        channel = null
      }
      if (connection) {
        connection.close()
        connection = null
      }
      ws?.close()
      ws = null
      if (peerJs) {
        peerJs.destroy()
        peerJs = null
      }
      peerJsConnecting = false
      peerJsFallbackActive = false
      options.channelRef.value = undefined
    }

    const scheduleWsReconnect = (identity: DeviceIdentity, reason: string) => {
      if (!active) return
      if (skipServer) return
      if (wsReconnectTimer !== null || wsReconnectPending) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        options.dmStatus.value = 'offline'
        wsReconnectPending = true
        debug('ws reconnect deferred (offline)', { reason })
        return
      }
      const serverBackoffMs = getServerBackoffMs(serverKey)
      if (serverBackoffMs > 0) {
        const activeChannel = options.channelRef.value ?? channel
        const channelOpen = activeChannel?.readyState === 'open'
        if (!channelOpen) {
          options.dmStatus.value = 'offline'
        }
        wsReconnectPending = true
        const selfUserId = options.selfUserId.value
        if (selfUserId && isCrdtSignalingBackoff()) {
          destroyCrdtProvider(contact.id, identity, selfUserId)
        }
        wsReconnectTimer = window.setTimeout(() => {
          wsReconnectTimer = null
          wsReconnectPending = false
          connectWs(identity)
        }, serverBackoffMs)
        debug('ws reconnect deferred (server backoff)', { reason, wait: serverBackoffMs })
        return
      }
      wsReconnectAttempt += 1
      const baseDelay = 800
      const maxDelay = 12_000
      const delay = Math.min(baseDelay * 2 ** (wsReconnectAttempt - 1), maxDelay)
      const jitter = Math.random() * delay * 0.3
      const wait = delay + jitter
      wsReconnectTimer = window.setTimeout(() => {
        wsReconnectTimer = null
        connectWs(identity)
      }, wait)
      debug('ws reconnect scheduled', { reason, attempt: wsReconnectAttempt, wait })
    }

    const resetPeerConnection = () => {
      if (channel) {
        channel.close?.()
        channel = null
      }
      if (connection) {
        connection.close()
        connection = null
      }
      options.channelRef.value = undefined
      options.sessionRef.value = undefined
      makingOffer = false
      iceRestarting = false
      iceRestartAttempts = 0
      peerJsFallbackActive = false
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
      if (peerJsEnabled && !wsHealthy) {
        const usedFallback = await maybeStartPeerJsFallback(identity, reason)
        if (usedFallback) return
      }
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
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
      const cachedDevices = loadDeviceCache(contact.id)
      if (isOffline && cachedDevices) {
        options.deviceListStaleAt.value = cachedDevices.updatedAt
        devices = cachedDevices.devices
        debug('loaded cached devices (offline)', {
          count: devices.length,
          devices: devices.map((entry) => entry.deviceId)
        })
        if (!options.remoteDeviceRef.value) {
          const preferred = pickPreferredDevice(devices)
          if (preferred) {
            options.remoteDeviceRef.value = noSerialize(preferred)
          }
        }
        return devices
      }
      const relayUrls = resolveAdvertisedRelays()
      let relayFailed = false
      let relayDevices: ContactDevice[] = []
      try {
        relayDevices = await fetchRelayDevices({ userId: contact.id, relayUrls })
      } catch {
        relayFailed = true
        relayDevices = []
      }
      let apiDevices: ContactDevice[] = []
      let apiAttempted = false
      let apiFailed = false
      if (!relayDevices.length && !skipServer && shouldAttemptServer(serverKey)) {
        apiAttempted = true
        try {
          const response = await fetch(
            buildApiUrl(`/chat/p2p/devices/${encodeURIComponent(contact.id)}`, window.location.origin),
            { credentials: 'include' }
          )
          if (response.ok) {
            const payload = (await response.json()) as { devices?: ContactDevice[] }
            apiDevices = Array.isArray(payload.devices) ? payload.devices.filter((device) => device.deviceId) : []
            markServerSuccess(serverKey)
            apiFailed = false
          } else if (response.status >= 500) {
            markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
            apiFailed = true
          } else {
            apiFailed = true
          }
        } catch {
          markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
          apiFailed = true
        }
      }
      const shouldUseCache = isOffline || relayFailed || (apiAttempted && apiFailed)
      const cacheList = shouldUseCache && cachedDevices ? cachedDevices.devices : []
      const next = mergeDeviceLists(apiDevices, relayDevices, cacheList)
      if (shouldUseCache && cachedDevices) {
        options.deviceListStaleAt.value = cachedDevices.updatedAt
      } else {
        options.deviceListStaleAt.value = null
      }
      if (!shouldUseCache) {
        saveDeviceCache(contact.id, next)
      }
      devices = next
      debug('fetched devices', { count: next.length, devices: next.map((entry) => entry.deviceId) })
      if (!options.remoteDeviceRef.value) {
        const preferred = pickPreferredDevice(next)
        if (preferred) {
          options.remoteDeviceRef.value = noSerialize(preferred)
        }
      }
      return next
    }

    const resolveContactDevice = async (deviceId: string) => {
      let device = devices.find((entry) => entry.deviceId === deviceId)
      if (device) return device
      await fetchDevices()
      device = devices.find((entry) => entry.deviceId === deviceId)
      return device ?? null
    }

    const clearPendingSignals = () => {
      pendingSignals.splice(0, pendingSignals.length)
    }

    const clearOfferTimeout = (sessionId?: string) => {
      if (!sessionId) return
      const timer = offerTimeouts.get(sessionId)
      if (timer !== undefined) {
        window.clearTimeout(timer)
        offerTimeouts.delete(sessionId)
      }
    }

    const clearOfferTimeouts = () => {
      for (const timer of offerTimeouts.values()) {
        window.clearTimeout(timer)
      }
      offerTimeouts.clear()
    }

    const startOfferTimeout = (sessionId: string) => {
      clearOfferTimeout(sessionId)
      const timer = window.setTimeout(() => {
        offerTimeouts.delete(sessionId)
        if (!active) return
        const currentSessionId = options.sessionRef.value?.sessionId
        if (currentSessionId && currentSessionId !== sessionId) return
        const activeChannel = options.channelRef.value ?? channel
        if (activeChannel?.readyState === 'open') return
        void (async () => {
          const restarted = await attemptIceRestart('offer-timeout')
          if (!restarted) {
            await scheduleReconnect('offer-timeout')
          }
        })()
      }, offerTimeoutMs)
      offerTimeouts.set(sessionId, timer)
    }

    const sendSignal = async (signal: Record<string, unknown>) => {
      const payload = isRecord(signal.payload) ? signal.payload : null
      const payloadType = payload?.type
      const wsOpen = ws?.readyState === WebSocket.OPEN
      if (wsOpen) {
        debug('signal via ws', { type: payloadType })
        ws?.send(JSON.stringify(signal))
        return
      }
      const shouldRelay =
        payloadType === 'offer' || payloadType === 'answer' || payloadType === 'candidate'
      if (shouldRelay) {
        const identity = options.identityRef.value
        const remoteDevice = options.remoteDeviceRef.value
        if (identity && remoteDevice) {
          const relaySignal = {
            ...signal,
            fromDeviceId: identity.deviceId,
            toDeviceId: remoteDevice.deviceId
          }
          const envelope = await encryptSignalPayload({
            identity,
            recipientId: contact.id,
            recipientDeviceId: remoteDevice.deviceId,
            relayUrls: remoteDevice.relayUrls,
            payload: { kind: 'signal', signal: relaySignal }
          })
          if (envelope) {
            const messageId = `signal:${createMessageId()}`
            const delivered = await sendRelayPayload(envelope, messageId, signal.sessionId as string | undefined)
            if (delivered > 0) {
              clearPendingSignals()
              debug('signal via relay', { type: payloadType })
              return
            }
          }
        }
      }
      debug('signal queued', { type: payloadType })
      pendingSignals.push(signal)
    }

    const resolvePeerJsOptions = (): PeerJSOption | null => {
      const raw = appConfig.p2pPeerjsServer
      if (!raw) return null
      try {
        const url = new URL(raw)
        const secure = url.protocol === 'https:' || url.protocol === 'wss:'
        const port = url.port ? Number.parseInt(url.port, 10) : secure ? 443 : 80
        const path = url.pathname.startsWith('/') ? url.pathname : `/${url.pathname}`
        const key = url.searchParams.get('key') ?? undefined
        return {
          host: url.hostname,
          port,
          path,
          secure,
          key,
          config: { iceServers: resolvedIceServers }
        }
      } catch {
        return null
      }
    }

    const wrapPeerJsConnection = (conn: DataConnection): DmDataChannel => {
      const channel: DmDataChannel = {
        label: conn.label ?? 'peerjs',
        readyState: conn.open ? 'open' : 'connecting',
        send: (data) => conn.send(data),
        close: () => conn.close(),
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null
      }
      conn.on('open', () => {
        channel.readyState = 'open'
        channel.onopen?.(new Event('open'))
      })
      conn.on('data', (data) => {
        channel.onmessage?.({ data } as MessageEvent)
      })
      conn.on('close', () => {
        channel.readyState = 'closed'
        channel.onclose?.(new Event('close'))
      })
      conn.on('error', () => {
        channel.readyState = 'closed'
        channel.onerror?.(new Event('error'))
      })
      return channel
    }

    const wrapRtcDataChannel = (rtc: RTCDataChannel): DmDataChannel => {
      const channel: DmDataChannel = {
        label: rtc.label || 'dm',
        readyState: rtc.readyState,
        send: (data) => rtc.send(data as never),
        close: () => rtc.close(),
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null
      }
      rtc.addEventListener('open', (event) => {
        channel.readyState = rtc.readyState
        channel.onopen?.(event)
      })
      rtc.addEventListener('message', (event) => {
        channel.onmessage?.(event as MessageEvent)
      })
      rtc.addEventListener('close', (event) => {
        channel.readyState = rtc.readyState
        channel.onclose?.(event)
      })
      rtc.addEventListener('error', (event) => {
        channel.readyState = rtc.readyState
        channel.onerror?.(event as Event)
      })
      Object.defineProperty(channel, 'binaryType', {
        get: () => rtc.binaryType,
        set: (value: BinaryType) => {
          rtc.binaryType = value
        },
        enumerable: true
      })
      return channel
    }

    const ensurePeerJsReady = async (identity: DeviceIdentity, timeoutMs = 4500) => {
      if (!peerJsEnabled) return null
      if (peerJs?.open) return peerJs
      if (!peerJsConnecting) {
        const options = resolvePeerJsOptions()
        if (!options) return null
        peerJsConnecting = true
        peerJs = new Peer(identity.deviceId, options)
        peerJs.on('open', () => {
          peerJsConnecting = false
          debug('peerjs open')
        })
        peerJs.on('connection', (conn) => {
          void handlePeerJsIncoming(conn)
        })
        peerJs.on('error', (error) => {
          debug('peerjs error', error)
          peerJsConnecting = false
        })
      }
      if (peerJs?.open) return peerJs
      return new Promise<Peer | null>((resolve) => {
        const existing = peerJs
        if (!existing) {
          resolve(null)
          return
        }
        const timer = window.setTimeout(() => {
          existing.off('open', handleOpen)
          existing.off('error', handleError)
          resolve(existing.open ? existing : null)
        }, timeoutMs)
        const handleOpen = () => {
          window.clearTimeout(timer)
          existing.off('error', handleError)
          resolve(existing)
        }
        const handleError = () => {
          window.clearTimeout(timer)
          existing.off('open', handleOpen)
          resolve(null)
        }
        existing.once('open', handleOpen)
        existing.once('error', handleError)
      })
    }

    const handlePeerJsIncoming = async (conn: DataConnection) => {
      const remoteDevice = await resolveContactDevice(conn.peer)
      if (!remoteDevice) {
        conn.close()
        return
      }
      options.remoteDeviceRef.value = noSerialize(remoteDevice)
      peerJsFallbackActive = true
      setupChannel(wrapPeerJsConnection(conn), { initiator: false })
    }

    const startPeerJsCaller = async (identity: DeviceIdentity, remoteDevice: ContactDevice) => {
      const peer = await ensurePeerJsReady(identity)
      if (!peer) return false
      const conn = peer.connect(remoteDevice.deviceId, {
        reliable: true,
        serialization: 'binary'
      })
      peerJsFallbackActive = true
      setupChannel(wrapPeerJsConnection(conn), { initiator: true })
      return true
    }

    const maybeStartPeerJsFallback = async (identity: DeviceIdentity, reason: string) => {
      if (!peerJsEnabled) return false
      if (peerJsFallbackActive) return true
      const remoteDevice = options.remoteDeviceRef.value
      if (!remoteDevice) return false
      debug('peerjs fallback', { reason, remoteDeviceId: remoteDevice.deviceId })
      const shouldInitiate = identity.deviceId.localeCompare(remoteDevice.deviceId) < 0
      if (shouldInitiate) {
        return await startPeerJsCaller(identity, remoteDevice)
      }
      const peer = await ensurePeerJsReady(identity)
      if (!peer) return false
      peerJsFallbackActive = true
      return true
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
        iceRestartAttempts = 0
        options.dmStatus.value = 'connected'
        return
      }
      if (state === 'failed' || state === 'disconnected') {
        void handleConnectionFailure(`connection-${state}`)
      }
    }

    const statusRank = (status?: DmMessage['status']) => {
      if (status === 'read') return 5
      if (status === 'sent') return 4
      if (status === 'queued') return 3
      if (status === 'pending') return 2
      if (status === 'failed') return 1
      return 0
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

    const sendProfileUpdate = async (profile: ProfilePayload | null, _targetDeviceId?: string) => {
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
    }

    const sendRelayPayload = async (payload: Record<string, unknown>, messageId: string, sessionId?: string) => {
      const manager = getRelayManager()
      if (!manager || !manager.clients.length) return 0
      const identity = options.identityRef.value
      const result = await manager.send({
        recipientId: contact.id,
        messageId,
        sessionId,
        payload,
        senderId: options.selfUserId.value,
        senderDeviceId: identity?.deviceId,
        recipientRelayKey: options.remoteDeviceRef.value?.relayPublicKey
      })
      return result?.delivered ?? 0
    }

    const sendReceipt = async (
      key: CryptoKey,
      sessionId: string,
      salt: string,
      receiptId: string,
      status: 'sent' | 'read'
    ) => {
      if (status === 'read' && !options.chatSettings.value.readReceipts) return
      const identity = options.identityRef.value
      if (!identity) return
      try {
        const receipt = await encryptPayload(
          key,
          JSON.stringify({ kind: 'receipt', id: receiptId, status }),
          sessionId,
          salt,
          identity.deviceId
        )
        const activeChannel = options.channelRef.value ?? channel
        if (activeChannel && activeChannel.readyState === 'open') {
          activeChannel.send(JSON.stringify({ type: 'message', payload: receipt }))
          return
        }
        const relayId = `receipt:${receiptId}:${createMessageId()}`
        await sendRelayPayload(receipt, relayId, sessionId)
      } catch {
        // ignore receipt failures
      }
    }

    const encodeBase64 = (bytes: Uint8Array) => {
      let binary = ''
      for (const byte of bytes) {
        binary += String.fromCharCode(byte)
      }
      return btoa(binary)
    }

    const normalizeBase64 = (value: string) => {
      const cleaned = value.replace(/\s+/g, '')
      const padding = cleaned.length % 4
      if (padding === 0) return cleaned
      return `${cleaned}${'='.repeat(4 - padding)}`
    }

    const decodeBase64Safe = (value: string) => decodeBase64(normalizeBase64(value))

    const decodeBase64Chunks = (chunks: string[]) => {
      const decodedChunks: Uint8Array[] = []
      let total = 0
      for (const chunk of chunks) {
        const bytes = decodeBase64Safe(chunk)
        decodedChunks.push(bytes)
        total += bytes.length
      }
      const assembled = new Uint8Array(total)
      let offset = 0
      for (const chunk of decodedChunks) {
        assembled.set(chunk, offset)
        offset += chunk.length
      }
      return assembled
    }

    const normalizeHistoryImage = (value: unknown) => {
      if (!isRecord(value)) return undefined
      const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl : ''
      if (!dataUrl) return undefined
      const name = typeof value.name === 'string' ? value.name : undefined
      const mime = typeof value.mime === 'string' ? value.mime : undefined
      const width = typeof value.width === 'number' ? value.width : undefined
      const height = typeof value.height === 'number' ? value.height : undefined
      const size = typeof value.size === 'number' ? value.size : undefined
      return { dataUrl, name, mime, width, height, size }
    }

    type Envelope =
      | { kind: 'signal'; envelope: SignalEnvelope }
      | { kind: 'aes'; envelope: EncryptedPayload }

    const resolveEnvelope = (payload: unknown): Envelope | null => {
      const signal = resolveSignalEnvelope(payload)
      if (signal) return { kind: 'signal', envelope: signal }
      const encrypted = resolveEncryptedPayload(payload)
      if (encrypted) return { kind: 'aes', envelope: encrypted }
      return null
    }

    const resolveSelfSyncEnvelope = (
      payload: unknown
    ): { contactId: string; author: PayloadContext['author']; envelope: Envelope } | null => {
      if (!isRecord(payload)) return null
      if (payload.kind !== 'sync') return null
      const contactId = typeof payload.contactId === 'string' ? payload.contactId : ''
      if (!contactId) return null
      const authorValue = payload.author
      const author: PayloadContext['author'] = authorValue === 'contact' ? 'contact' : 'self'
      const envelope = resolveEnvelope(payload.payload)
      if (!envelope) return null
      return { contactId, author, envelope }
    }

    const resolvePayloadDevice = async (senderDeviceId: string | undefined, context: PayloadContext) => {
      const deviceId =
        senderDeviceId ??
        (context.source === 'contact'
          ? options.sessionRef.value?.remoteDeviceId ?? options.remoteDeviceRef.value?.deviceId
          : undefined)
      if (!deviceId) return null
      const device =
        context.source === 'self' ? await resolveSelfDevice(deviceId) : await resolveContactDevice(deviceId)
      if (!device) return null
      if (context.source === 'contact') {
        options.remoteDeviceRef.value = noSerialize(device)
      }
      return device
    }

    const handlePlaintextPayload = async (
      plaintext: string,
      context: PayloadContext,
      senderDeviceId: string | undefined,
      respond: {
        sendReceipt?: (messageId: string, status: 'sent' | 'read') => Promise<void>
        sendHistoryResponse?: (messages: DmMessage[]) => Promise<void>
      }
    ) => {
      try {
        const identity = options.identityRef.value
        if (!identity) return false
        let messageText = plaintext
        let messageId = createMessageId()
        let createdAt = new Date().toISOString()
        let isReceipt = false
        let receiptTargetId: string | null = null
        let receiptStatus: 'sent' | 'read' | null = null
        let isHistoryRequest = false
        let historyLimit = historyRequestLimit
        let historyResponse: DmMessage[] | null = null
        let typingState: 'start' | 'stop' | null = null
        let profileMeta: ProfileMeta | null = null
        let profilePayload: ProfilePayload | null = null
        let avatarChunk: { hash: string; updatedAt?: string; index: number; total: number; data: string } | null = null
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
              encoding?: 'zstd'
            }
          | null = null
        let imageChunk: { id: string; index: number; total: number; data: string } | null = null
        let imageChunkBatch:
          | {
              id: string
              total: number
              chunks: Array<{ index: number; data: string }>
            }
          | null = null
        let inlineImage:
          | {
              id: string
              createdAt: string
              payloadBase64: string
              encoding?: 'zstd'
              name?: string
              mime?: string
              size?: number
              width?: number
              height?: number
            }
          | null = null
        let crdtKey: { key: string; room: string } | null = null
        let crdtKeyRequest: string | null = null
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
            status?: string
            meta?: Record<string, unknown>
            profile?: Record<string, unknown>
            hash?: string
            updatedAt?: string
            key?: string
            room?: string
            index?: number
            total?: number
            data?: string
            name?: string
            mime?: string
            encoding?: string
            size?: number
            width?: number
            height?: number
            chunks?: Array<{ index?: number; data?: string }>
            payloadBase64?: string
          }
          if (messagePayload?.kind === 'receipt') {
            isReceipt = true
            if (typeof messagePayload.id === 'string') {
              receiptTargetId = messagePayload.id
            }
            if (messagePayload.status === 'sent' || messagePayload.status === 'read') {
              receiptStatus = messagePayload.status
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
              avatarChunk = { hash, index, total, data }
              if (typeof messagePayload.updatedAt === 'string') {
                avatarChunk.updatedAt = messagePayload.updatedAt
              }
            }
          } else if (messagePayload?.kind === 'profile-meta') {
            const meta = parseProfileMeta(messagePayload.meta)
            if (meta) profileMeta = meta
          } else if (messagePayload?.kind === 'profile-request') {
            const meta = parseProfileMeta(messagePayload.meta)
            if (meta) profileRequest = true
          } else if (messagePayload?.kind === 'profile-update') {
            const profile = parseProfilePayload(messagePayload.profile)
            if (profile) profilePayload = profile
          } else if (messagePayload?.kind === 'history-request') {
            isHistoryRequest = true
            if (Number.isFinite(messagePayload.limit)) {
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
              const author = entry.author === 'self' || entry.author === 'contact' ? entry.author : undefined
              const kind = entry.kind === 'image' ? 'image' : 'text'
              const image = normalizeHistoryImage(entry.image)
              if (!id || !created || !author) continue
              mapped.push({ id, text, createdAt: created, author, status: 'sent', kind, image })
            }
            historyResponse = mapped
          } else if (messagePayload?.kind === 'crdt-key') {
            const key = typeof messagePayload.key === 'string' ? messagePayload.key : ''
            const room = typeof messagePayload.room === 'string' ? messagePayload.room : ''
            if (key && room) {
              crdtKey = { key, room }
            }
          } else if (messagePayload?.kind === 'crdt-key-request') {
            const room = typeof messagePayload.room === 'string' ? messagePayload.room : ''
            if (room) {
              crdtKeyRequest = room
            }
          } else if (messagePayload?.kind === 'image-meta') {
            const id = typeof messagePayload.id === 'string' ? messagePayload.id : ''
            const created = typeof messagePayload.createdAt === 'string' ? messagePayload.createdAt : ''
            const total = Number(messagePayload.total)
            if (id && created && Number.isFinite(total)) {
              imageMeta = {
                id,
                createdAt: created,
                total,
                name: typeof messagePayload.name === 'string' ? messagePayload.name : undefined,
                mime: typeof messagePayload.mime === 'string' ? messagePayload.mime : undefined,
                encoding: messagePayload.encoding === 'zstd' ? 'zstd' : undefined,
                size: Number.isFinite(messagePayload.size) ? messagePayload.size : undefined,
                width: Number.isFinite(messagePayload.width) ? messagePayload.width : undefined,
                height: Number.isFinite(messagePayload.height) ? messagePayload.height : undefined
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
          } else if (messagePayload?.kind === 'image-chunk-batch') {
            const id = typeof messagePayload.id === 'string' ? messagePayload.id : ''
            const total = Number(messagePayload.total)
            const chunks = Array.isArray(messagePayload.chunks) ? messagePayload.chunks : []
            if (id && Number.isFinite(total) && chunks.length) {
              const normalized: Array<{ index: number; data: string }> = []
              for (const chunk of chunks) {
                const index = Number(chunk.index)
                const data = typeof chunk.data === 'string' ? chunk.data : ''
                if (Number.isFinite(index) && data) {
                  normalized.push({ index, data })
                }
              }
              if (normalized.length) {
                imageChunkBatch = { id, total, chunks: normalized }
              }
            }
          } else if (messagePayload?.kind === 'image-inline') {
            const id = typeof messagePayload.id === 'string' ? messagePayload.id : ''
            const created = typeof messagePayload.createdAt === 'string' ? messagePayload.createdAt : ''
            const payloadBase64 = typeof messagePayload.payloadBase64 === 'string' ? messagePayload.payloadBase64 : ''
            if (id && created && payloadBase64) {
              inlineImage = {
                id,
                createdAt: created,
                payloadBase64,
                encoding: messagePayload.encoding === 'zstd' ? 'zstd' : undefined,
                name: typeof messagePayload.name === 'string' ? messagePayload.name : undefined,
                mime: typeof messagePayload.mime === 'string' ? messagePayload.mime : undefined,
                size: Number.isFinite(messagePayload.size) ? messagePayload.size : undefined,
                width: Number.isFinite(messagePayload.width) ? messagePayload.width : undefined,
                height: Number.isFinite(messagePayload.height) ? messagePayload.height : undefined
              }
            }
          } else if (messagePayload?.kind === 'message') {
            const nextId = typeof messagePayload.id === 'string' ? messagePayload.id : messageId
            const nextText = typeof messagePayload.text === 'string' ? messagePayload.text : messageText
            const nextCreatedAt =
              typeof messagePayload.createdAt === 'string' ? messagePayload.createdAt : createdAt
            messageId = nextId
            messageText = nextText
            createdAt = nextCreatedAt
          }
        } catch {
          // ignore parse errors
        }
        const activeChannel = options.channelRef.value ?? channel
        const messageAuthor = context.author
        const allowRemoteMetadata = context.source === 'contact'
        if (isReceipt && allowRemoteMetadata) {
          if (receiptTargetId) {
            const nextStatus = receiptStatus ?? 'read'
            options.dmMessages.value = options.dmMessages.value.map((message) => {
              if (message.id !== receiptTargetId) return message
              if (statusRank(nextStatus) <= statusRank(message.status)) return message
              return { ...message, status: nextStatus }
            })
            void persistHistory(contact.id, identity, options.dmMessages.value)
            void removeOutboxItems(contact.id, identity, [receiptTargetId])
          }
          return true
        }
        if (typingState && allowRemoteMetadata) {
          setRemoteTyping(typingState === 'start')
          return true
        }
        if (imageMeta) {
          storeImageMeta(imageMeta)
          return true
        }
        if (imageChunk) {
          const message = await storeImageChunk(imageChunk, messageAuthor)
          if (message && appendIncomingMessage(message)) {
            void persistHistory(contact.id, identity, options.dmMessages.value)
            if (context.source === 'contact') {
              const syncPayload = buildSelfSyncPayload(message)
              if (syncPayload) {
                void sendSelfSyncPayload(syncPayload, message.id, message.author)
              }
            }
            if (allowRemoteMetadata && respond.sendReceipt) {
              await respond.sendReceipt(
                message.id,
                options.chatSettings.value.readReceipts ? 'read' : 'sent'
              )
            }
          }
          return true
        }
        if (imageChunkBatch) {
          let assembled: DmMessage | null = null
          for (const chunk of imageChunkBatch.chunks) {
            const message = await storeImageChunk(
              { id: imageChunkBatch.id, index: chunk.index, total: imageChunkBatch.total, data: chunk.data },
              messageAuthor
            )
            if (message) {
              assembled = message
            }
          }
          if (assembled && appendIncomingMessage(assembled)) {
            void persistHistory(contact.id, identity, options.dmMessages.value)
            if (context.source === 'contact') {
              const syncPayload = buildSelfSyncPayload(assembled)
              if (syncPayload) {
                void sendSelfSyncPayload(syncPayload, assembled.id, assembled.author)
              }
            }
            if (allowRemoteMetadata && respond.sendReceipt) {
              await respond.sendReceipt(
                assembled.id,
                options.chatSettings.value.readReceipts ? 'read' : 'sent'
              )
            }
          }
          return true
        }
        if (inlineImage) {
          const message = await buildInlineImageMessage(inlineImage, messageAuthor)
          if (message && appendIncomingMessage(message)) {
            void persistHistory(contact.id, identity, options.dmMessages.value)
            if (context.source === 'contact') {
              const syncPayload = buildSelfSyncPayload(message)
              if (syncPayload) {
                void sendSelfSyncPayload(syncPayload, message.id, message.author)
              }
            }
            if (allowRemoteMetadata && respond.sendReceipt) {
              await respond.sendReceipt(
                message.id,
                options.chatSettings.value.readReceipts ? 'read' : 'sent'
              )
            }
          }
          return true
        }
        if (avatarChunk && allowRemoteMetadata) {
          const key = `${contact.id}:${avatarChunk.hash}`
          const existing =
            avatarChunks.get(key) ?? {
              total: avatarChunk.total,
              chunks: Array.from({ length: avatarChunk.total }, () => ''),
              updatedAt: avatarChunk.updatedAt
            }
          if (existing.total !== avatarChunk.total) {
            existing.total = avatarChunk.total
            existing.chunks = Array.from({ length: avatarChunk.total }, () => '')
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
          return true
        }
        if (profileMeta && allowRemoteMetadata) {
          const cachedProfile = options.contactProfiles.value[contact.id] ?? loadRemoteProfile(contact.id)
          if (cachedProfile && !options.contactProfiles.value[contact.id]) {
            options.contactProfiles.value = { ...options.contactProfiles.value, [contact.id]: cachedProfile }
          }
          const cachedMeta = loadRemoteProfileMeta(contact.id)
          const needsProfile = !cachedProfile
          const metaChanged = !cachedMeta || cachedMeta.hash !== profileMeta.hash
          saveRemoteProfileMeta(contact.id, profileMeta)
          if ((metaChanged || needsProfile) && activeChannel && activeChannel.readyState === 'open') {
            await requestProfileUpdate(profileMeta, senderDeviceId)
          }
          return true
        }
        if (profileRequest && allowRemoteMetadata) {
          await sendProfileUpdate(resolveLocalProfile(), senderDeviceId)
          return true
        }
        if (profilePayload && allowRemoteMetadata) {
          applyRemoteProfile(profilePayload)
          return true
        }
        if (historyResponse && allowRemoteMetadata) {
          if (options.historySuppressed.value) return true
          options.dmMessages.value = mergeHistoryMessages(options.dmMessages.value, historyResponse)
          void persistHistory(contact.id, identity, options.dmMessages.value)
          return true
        }
        if (crdtKey) {
          const selfUserId = options.selfUserId.value
          if (selfUserId && crdtKey.room === buildCrdtRoomName(selfUserId, contact.id)) {
            await setReplicationKey(contact.id, identity, crdtKey.key)
            await resetCrdtProvider(contact.id, identity, selfUserId)
          }
          return true
        }
        if (crdtKeyRequest) {
          const selfUserId = options.selfUserId.value
          const roomName = selfUserId ? buildCrdtRoomName(selfUserId, contact.id) : null
          if (selfUserId && roomName && crdtKeyRequest === roomName) {
            const key = await loadReplicationKey(contact.id, identity)
            if (key) {
              await sendCrdtKey(identity, key, roomName)
            } else {
              const remoteDevice = options.remoteDeviceRef.value
              const isLeader = remoteDevice ? identity.deviceId.localeCompare(remoteDevice.deviceId) < 0 : false
              if (isLeader) {
                const nextKey = await ensureReplicationKey(contact.id, identity, { generate: true })
                if (nextKey) {
                  await resetCrdtProvider(contact.id, identity, selfUserId)
                  await sendCrdtKey(identity, nextKey, roomName)
                }
              }
            }
          }
          return true
        }
        if (isHistoryRequest && allowRemoteMetadata && respond.sendHistoryResponse) {
          let snapshot = options.dmMessages.value
          if (!snapshot.length) {
            snapshot = await loadHistory(contact.id, identity)
          }
          if (!snapshot.length) return true
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
          await respond.sendHistoryResponse(trimmed)
          return true
        }
        if (
          appendIncomingMessage({
            id: messageId,
            text: messageText,
            author: messageAuthor,
            createdAt,
            status: 'sent'
          })
        ) {
          void persistHistory(contact.id, identity, options.dmMessages.value)
          if (context.source === 'contact') {
            const syncPayload = buildSelfSyncPayload({
              id: messageId,
              text: messageText,
              author: messageAuthor,
              createdAt,
              status: 'sent'
            })
            if (syncPayload) {
              void sendSelfSyncPayload(syncPayload, messageId, messageAuthor)
            }
          }
        }
        if (receiptTargetId && allowRemoteMetadata && respond.sendReceipt) {
          await respond.sendReceipt(receiptTargetId, options.chatSettings.value.readReceipts ? 'read' : 'sent')
        }
        return true
      } catch (error) {
        reportDmError(error instanceof Error ? error.message : 'Unable to decrypt message.')
        return false
      }
    }

    const handleEncryptedPayload = async (encrypted: EncryptedPayload, context: PayloadContext) => {
      try {
        const identity = options.identityRef.value
        if (!identity) return false
        const senderDeviceId = typeof encrypted.senderDeviceId === 'string' ? encrypted.senderDeviceId : undefined
        const device = await resolvePayloadDevice(senderDeviceId, context)
        if (!device) return false
        const key = await deriveSessionKey(
          identity.privateKey,
          device.publicKey,
          decodeBase64(encrypted.salt),
          encrypted.sessionId
        )
        const currentSession = options.sessionRef.value
        if (context.source === 'contact' && (!currentSession || currentSession.sessionId === encrypted.sessionId)) {
          options.sessionRef.value = noSerialize({
            sessionId: encrypted.sessionId,
            salt: encrypted.salt,
            key,
            remoteDeviceId: device.deviceId
          })
        }
        const plaintext = await decryptPayload(key, encrypted)
        return await handlePlaintextPayload(plaintext, context, senderDeviceId, {
          sendReceipt: async (messageId, status) => {
            await sendReceipt(key, encrypted.sessionId, encrypted.salt, messageId, status)
          },
          sendHistoryResponse: async (messages) => {
            try {
              const responsePayload = await encryptPayload(
                key,
                JSON.stringify({ kind: 'history-response', messages }),
                encrypted.sessionId,
                encrypted.salt,
                identity.deviceId
              )
              const activeChannel = options.channelRef.value ?? channel
              if (activeChannel && activeChannel.readyState === 'open') {
                activeChannel.send(JSON.stringify({ type: 'message', payload: responsePayload }))
              }
            } catch {
              // ignore history response failures
            }
          }
        })
      } catch (error) {
        reportDmError(error instanceof Error ? error.message : 'Unable to decrypt message.')
        return false
      }
    }

    const handleSignalPayload = async (envelope: SignalEnvelope, context: PayloadContext) => {
      try {
        const identity = options.identityRef.value
        if (!identity) return false
        const senderDeviceId = typeof envelope.senderDeviceId === 'string' ? envelope.senderDeviceId : undefined
        const device = await resolvePayloadDevice(senderDeviceId, context)
        if (!device) return false
        const senderId = context.source === 'contact' ? contact.id : options.selfUserId.value
        if (!senderId) return false
        const plaintext = await decryptSignalPayload({
          identity,
          senderId,
          senderDeviceId: device.deviceId,
          envelope
        })
        if (!plaintext) return false
        let parsed: unknown = null
        try {
          parsed = JSON.parse(plaintext)
        } catch {
          parsed = null
        }
        if (isRecord(parsed) && parsed.kind === 'signal' && isRecord(parsed.signal)) {
          await handleSignal(parsed.signal)
          return true
        }
        const allowRemoteMetadata = context.source === 'contact'
        return await handlePlaintextPayload(plaintext, context, device.deviceId, {
          sendReceipt: allowRemoteMetadata
            ? async (messageId, status) => {
                if (status === 'read' && !options.chatSettings.value.readReceipts) return
                const receipt = await encryptSignalPayload({
                  identity,
                  recipientId: senderId,
                  recipientDeviceId: device.deviceId,
                  relayUrls: device.relayUrls,
                  payload: { kind: 'receipt', id: messageId, status }
                })
                if (!receipt) return
                const relayId = `receipt:${messageId}:${createMessageId()}`
                await sendRelayPayload(receipt, relayId)
              }
            : undefined,
          sendHistoryResponse: allowRemoteMetadata
            ? async (messages) => {
                const response = await encryptSignalPayload({
                  identity,
                  recipientId: senderId,
                  recipientDeviceId: device.deviceId,
                  relayUrls: device.relayUrls,
                  payload: { kind: 'history-response', messages }
                })
                if (!response) return
                const relayId = `history:${createMessageId()}`
                await sendRelayPayload(response, relayId)
              }
            : undefined
        })
      } catch (error) {
        reportDmError(error instanceof Error ? error.message : 'Unable to decrypt message.')
        return false
      }
    }

    const flushOutbox = async () => {
      if (flushingOutbox) return
      const identity = options.identityRef.value
      const activeContact = options.activeContact.value
      const session = options.sessionRef.value
      const activeChannel = options.channelRef.value ?? channel
      if (!identity || !activeContact) return
      const channelReady = Boolean(session && activeChannel && activeChannel.readyState === 'open')
      let relayDevice: ContactDevice | undefined = options.remoteDeviceRef.value ?? undefined
      if (!channelReady && !relayDevice) {
        await fetchDevices()
        relayDevice = options.remoteDeviceRef.value ?? pickPreferredDevice(devices) ?? undefined
        if (relayDevice) {
          options.remoteDeviceRef.value = noSerialize(relayDevice)
        }
      }
      if (!channelReady && !relayDevice) return
      flushingOutbox = true
      try {
        const queued = await loadOutbox(activeContact.id, identity)
        if (!queued.length) return
        const remaining: OutboxItem[] = []
        let updated = false
        const now = Date.now()
        for (const item of queued) {
          const lastSentAt = item.sentAt ? Date.parse(item.sentAt) : 0
          if (item.sentAt && Number.isFinite(lastSentAt) && now - lastSentAt < outboxResendIntervalMs) {
            remaining.push(item)
            continue
          }
          let sent = false
          let sentVia: 'channel' | 'relay' | undefined
          try {
            if (item.kind === 'text') {
              if (channelReady && session && activeChannel) {
                const payload = await encryptPayload(
                  session.key,
                  JSON.stringify({
                    kind: 'message',
                    id: item.id,
                    text: item.text ?? '',
                    createdAt: item.createdAt
                  }),
                  session.sessionId,
                  session.salt,
                  identity.deviceId
                )
                activeChannel.send(JSON.stringify({ type: 'message', payload }))
                sent = true
                sentVia = 'channel'
              } else if (relayDevice) {
                const encrypted = await encryptRelayPayloadForDevice(
                  { kind: 'message', id: item.id, text: item.text ?? '', createdAt: item.createdAt },
                  activeContact.id,
                  relayDevice
                )
                if (encrypted) {
                  const delivered = await sendRelayPayload(encrypted.payload, item.id, encrypted.sessionId)
                  sent = delivered > 0
                  sentVia = sent ? 'relay' : undefined
                }
              }
            } else if (item.kind === 'image') {
              const payloadBase64 = item.payloadBase64 ?? ''
              if (!payloadBase64) {
                remaining.push(item)
                continue
              }
              const payloadBytes = decodeBase64Safe(payloadBase64)
              if (channelReady && session && activeChannel) {
                const channelChunkSize = 32_000
                const total = Math.max(1, Math.ceil(payloadBytes.length / channelChunkSize))
                const metaPayload = {
                  kind: 'image-meta',
                  id: item.id,
                  createdAt: item.createdAt,
                  name: item.name,
                  mime: item.mime,
                  size: item.size,
                  width: item.width,
                  height: item.height,
                  total,
                  encoding: item.encoding === 'zstd' ? 'zstd' : undefined
                }
                const metaEncrypted = await encryptPayload(
                  session.key,
                  JSON.stringify(metaPayload),
                  session.sessionId,
                  session.salt,
                  identity.deviceId
                )
                activeChannel.send(JSON.stringify({ type: 'message', payload: metaEncrypted }))
                for (let index = 0; index < total; index += 1) {
                  const start = index * channelChunkSize
                  const end = Math.min(payloadBytes.length, start + channelChunkSize)
                  const data = payloadBytes.slice(start, end)
                  const envelope = encodeBinaryEnvelope(
                    await encryptPayloadBinary(
                      session.key,
                      encodeBinaryMessage({ kind: 'image-chunk-bin', id: item.id, index, total }, data)
                    )
                  )
                  activeChannel.send(envelope)
                }
                sent = true
                sentVia = 'channel'
              } else if (relayDevice && payloadBytes.length <= selfSyncInlineLimitBytes) {
                const encrypted = await encryptRelayPayloadForDevice(
                  {
                    kind: 'image-inline',
                    id: item.id,
                    createdAt: item.createdAt,
                    payloadBase64,
                    encoding: item.encoding === 'zstd' ? 'zstd' : undefined,
                    name: item.name,
                    mime: item.mime,
                    size: item.size,
                    width: item.width,
                    height: item.height
                  },
                  activeContact.id,
                  relayDevice
                )
                if (encrypted) {
                  const delivered = await sendRelayPayload(encrypted.payload, item.id, encrypted.sessionId)
                  sent = delivered > 0
                  sentVia = sent ? 'relay' : undefined
                }
              } else {
                remaining.push(item)
                continue
              }
            } else {
              remaining.push(item)
              continue
            }
          } catch {
            sent = false
            sentVia = undefined
          }
          if (sent) {
            updated = true
            remaining.push({
              ...item,
              sentAt: new Date(now).toISOString(),
              attempts: (item.attempts ?? 0) + 1,
              sentVia: sentVia ?? 'channel'
            })
            options.dmMessages.value = options.dmMessages.value.map((message) =>
              message.id === item.id ? { ...message, status: sentVia === 'relay' ? 'queued' : 'sent' } : message
            )
          } else if (!remaining.includes(item)) {
            remaining.push(item)
          }
        }
        await saveOutbox(activeContact.id, identity, remaining)
        if (updated) {
          void persistHistory(activeContact.id, identity, options.dmMessages.value)
        }
      } finally {
        flushingOutbox = false
      }
    }

    const pullMailbox = async () => {
      if (mailboxPulling) return
      const identity = options.identityRef.value
      if (!identity) return
      const manager = getRelayManager()
      const selfManager = await getSelfRelayManager()
      const hasRelayClients = Boolean(manager?.clients.length || selfManager?.clients.length)
      if (!hasRelayClients) return
      mailboxPulling = true
      try {
        const selfUserId = options.selfUserId.value
        const pulls: Array<Promise<RelayMessage[]>> = []
        if (manager?.clients.length) {
          pulls.push(
            manager.pull({
              deviceId: identity.deviceId,
              limit: 50,
              relayPublicKey: identity.relayPublicKey || undefined,
              userId: selfUserId || undefined
            })
          )
        }
        if (selfManager?.clients.length) {
          pulls.push(
            selfManager.pull({
              deviceId: identity.deviceId,
              limit: 50,
              relayPublicKey: identity.relayPublicKey || undefined,
              userId: selfUserId || undefined
            })
          )
        }
        const results = await Promise.all(pulls)
        const messages = results.flat()
        const seen = new Set<string>()
        const unique = messages.filter((message) => {
          const key = `${message.relayBase}:${message.id}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        const filtered = unique.filter(
          (message) => message.from === contact.id || (selfUserId && message.from === selfUserId)
        )
        if (!filtered.length) return
        const handled: RelayMessage[] = []
        for (const message of filtered) {
          if (message.from === contact.id) {
            const envelope = resolveEnvelope(message.payload)
            if (!envelope) {
              handled.push(message)
              continue
            }
            const processed =
              envelope.kind === 'signal'
                ? await handleSignalPayload(envelope.envelope, { source: 'contact', author: 'contact' })
                : await handleEncryptedPayload(envelope.envelope, { source: 'contact', author: 'contact' })
            if (processed) {
              handled.push(message)
            }
            continue
          }
          if (selfUserId && message.from === selfUserId) {
            const sync = resolveSelfSyncEnvelope(message.payload)
            if (!sync || sync.contactId !== contact.id) {
              continue
            }
            const processed =
              sync.envelope.kind === 'signal'
                ? await handleSignalPayload(sync.envelope.envelope, { source: 'self', author: sync.author })
                : await handleEncryptedPayload(sync.envelope.envelope, { source: 'self', author: sync.author })
            if (processed) {
              handled.push(message)
            }
          }
        }
        if (!handled.length) return
        const grouped = new Map<string, string[]>()
        for (const message of handled) {
          const entries = grouped.get(message.relayBase) ?? []
          entries.push(message.id)
          grouped.set(message.relayBase, entries)
        }
        const relayClients = [
          ...(manager?.clients ?? []),
          ...(selfManager?.clients ?? [])
        ]
        await Promise.all(
          Array.from(grouped.entries()).map(([relayBase, ids]) => {
            const client = relayClients.find((entry) => entry.baseUrl === relayBase)
            if (!client) return Promise.resolve(0)
            return client.ack(identity.deviceId, ids)
          })
        )
      } finally {
        mailboxPulling = false
      }
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const payload = event.data
      if (!isRecord(payload)) return
      if (payload.type !== 'p2p:flush-outbox') return
      void flushOutbox()
      void pullMailbox()
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)
    }

    const handleOnline = () => {
      void flushOutbox()
      void pullMailbox()
      if (!active) return
      if (!wsHealthy && wsReconnectPending && options.identityRef.value) {
        wsReconnectPending = false
        scheduleWsReconnect(options.identityRef.value, 'network-online')
      }
    }

    const handleOffline = () => {
      if (!active) return
      options.dmStatus.value = 'offline'
      wsReconnectPending = true
      const identity = options.identityRef.value
      const selfUserId = options.selfUserId.value
      if (identity && selfUserId) {
        destroyCrdtProvider(contact.id, identity, selfUserId)
      }
    }

    const handleNetworkStatus = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as { online?: boolean } | undefined
      if (detail?.online === true) {
        handleOnline()
      } else if (detail?.online === false) {
        handleOffline()
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('prom:network-status', handleNetworkStatus)

    const handleVisibilityResume = () => {
      if (!active) return
      if (options.dmStatus.value !== 'offline' && options.dmStatus.value !== 'connecting') return
      const identity = options.identityRef.value
      if (!identity) return
      connectWs(identity)
      void pullMailbox()
      void scheduleReconnect('visibility-resume')
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleVisibilityResume()
      }
    }

    const handleWindowFocus = () => {
      handleVisibilityResume()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    const decodeBinaryMessage = (bytes: Uint8Array) => {
      if (bytes.length < 2) return null
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const headerLength = view.getUint16(0)
      if (bytes.length < 2 + headerLength) return null
      const headerBytes = bytes.slice(2, 2 + headerLength)
      const headerText = new TextDecoder().decode(headerBytes)
      let header: Record<string, unknown>
      try {
        header = JSON.parse(headerText) as Record<string, unknown>
      } catch {
        return null
      }
      const data = bytes.slice(2 + headerLength)
      return { header, data }
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

    const markIncomingImage = (id: string) => {
      if (incomingImageIds.has(id)) return
      incomingImageIds.add(id)
      options.incomingImageCount.value += 1
    }

    const clearIncomingImage = (id: string) => {
      if (!incomingImageIds.has(id)) return
      incomingImageIds.delete(id)
      options.incomingImageCount.value = Math.max(0, options.incomingImageCount.value - 1)
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
      encoding?: 'zstd'
    }) => {
      const existing = imageChunks.get(meta.id)
      if (existing) {
        existing.meta = meta
        if (existing.total !== meta.total) {
          existing.total = meta.total
          existing.chunks = Array.from({ length: meta.total }, () => '')
        }
        return
      }
      markIncomingImage(meta.id)
      imageChunks.set(meta.id, {
        total: meta.total,
        chunks: Array.from({ length: meta.total }, () => ''),
        meta
      })
    }

    const storeImageChunk = async (
      payload: { id: string; index: number; total: number; data: string },
      author: DmMessage['author']
    ) => {
      const existing =
        imageChunks.get(payload.id) ?? {
          total: payload.total,
          chunks: Array.from({ length: payload.total }, () => ''),
          meta: undefined
        }
      if (!imageChunks.has(payload.id)) {
        markIncomingImage(payload.id)
      }
      if (existing.total !== payload.total) {
        existing.total = payload.total
        existing.chunks = Array.from({ length: payload.total }, () => '')
      }
      if (payload.index >= 0 && payload.index < existing.total) {
        existing.chunks[payload.index] = payload.data
      }
      imageChunks.set(payload.id, existing)
      if (!existing.chunks.every((chunk) => chunk)) {
        return null
      }
      const meta = existing.meta
      const base64 = normalizeBase64(existing.chunks.join(''))
      const mime = meta?.mime ?? 'image/png'
      let encodedBytes: Uint8Array
      try {
        encodedBytes = decodeBase64Safe(base64)
      } catch {
        try {
          encodedBytes = decodeBase64Chunks(existing.chunks)
        } catch {
          imageChunks.delete(payload.id)
          clearIncomingImage(payload.id)
          options.dmError.value = 'Unable to decode image.'
          return null
        }
      }
      let imageBytes = encodedBytes
      if (meta?.encoding === 'zstd') {
        const decompressed = await zstdDecompress(encodedBytes)
        if (!decompressed) {
          imageChunks.delete(payload.id)
          clearIncomingImage(payload.id)
          options.dmError.value = 'Unable to decode image.'
          return null
        }
        imageBytes = Uint8Array.from(decompressed)
      }
      const dataUrl = `data:${mime};base64,${encodeBase64(imageBytes)}`
      const createdAt = meta?.createdAt ?? new Date().toISOString()
      imageChunks.delete(payload.id)
      clearIncomingImage(payload.id)
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

    const storeImageChunkBinary = async (
      payload: { id: string; index: number; total: number; data: Uint8Array },
      author: DmMessage['author']
    ) => {
      const existing =
        binaryImageChunks.get(payload.id) ?? {
          total: payload.total,
          chunks: Array.from({ length: payload.total }, () => null)
        }
      if (!binaryImageChunks.has(payload.id)) {
        markIncomingImage(payload.id)
      }
      if (existing.total !== payload.total) {
        existing.total = payload.total
        existing.chunks = Array.from({ length: payload.total }, () => null)
      }
      if (payload.index >= 0 && payload.index < existing.total) {
        existing.chunks[payload.index] = payload.data
      }
      binaryImageChunks.set(payload.id, existing)
      if (!existing.chunks.every((chunk) => chunk)) {
        return null
      }
      const meta = imageChunks.get(payload.id)?.meta
      const mime = meta?.mime ?? 'image/png'
      const totalSize = existing.chunks.reduce((sum, chunk) => sum + (chunk?.length ?? 0), 0)
      const assembled = new Uint8Array(totalSize)
      let offset = 0
      for (const chunk of existing.chunks) {
        if (!chunk) continue
        assembled.set(chunk, offset)
        offset += chunk.length
      }
      binaryImageChunks.delete(payload.id)
      imageChunks.delete(payload.id)
      clearIncomingImage(payload.id)
      let imageBytes = assembled
      if (meta?.encoding === 'zstd') {
        const decompressed = await zstdDecompress(assembled)
        if (!decompressed) {
          binaryImageChunks.delete(payload.id)
          imageChunks.delete(payload.id)
          clearIncomingImage(payload.id)
          options.dmError.value = 'Unable to decode image.'
          return null
        }
        imageBytes = Uint8Array.from(decompressed)
      }
      const dataUrl = `data:${mime};base64,${encodeBase64(imageBytes)}`
      const createdAt = meta?.createdAt ?? new Date().toISOString()
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

    const buildInlineImageMessage = async (
      payload: {
        id: string
        createdAt: string
        payloadBase64: string
        encoding?: 'zstd'
        name?: string
        mime?: string
        size?: number
        width?: number
        height?: number
      },
      author: DmMessage['author']
    ) => {
      const base64 = normalizeBase64(payload.payloadBase64)
      let encodedBytes: Uint8Array
      try {
        encodedBytes = decodeBase64Safe(base64)
      } catch {
        options.dmError.value = 'Unable to decode image.'
        return null
      }
      let imageBytes = encodedBytes
      if (payload.encoding === 'zstd') {
        const decompressed = await zstdDecompress(encodedBytes)
        if (!decompressed) {
          options.dmError.value = 'Unable to decode image.'
          return null
        }
        imageBytes = Uint8Array.from(decompressed)
      }
      const mime = payload.mime ?? 'image/png'
      const dataUrl = `data:${mime};base64,${encodeBase64(imageBytes)}`
      return {
        id: payload.id,
        text: '',
        author,
        createdAt: payload.createdAt,
        status: 'sent',
        kind: 'image',
        image: {
          dataUrl,
          name: payload.name,
          mime,
          size: payload.size,
          width: payload.width,
          height: payload.height
        }
      } satisfies DmMessage
    }

    const extractBase64FromDataUrl = (dataUrl: string) => {
      const commaIndex = dataUrl.indexOf(',')
      if (commaIndex === -1) return ''
      return dataUrl.slice(commaIndex + 1)
    }

    const buildSelfSyncPayload = (message: DmMessage): Record<string, unknown> | null => {
      if (message.kind === 'image') {
        const image = message.image
        if (!image?.dataUrl) return null
        if (image.size && image.size > selfSyncInlineLimitBytes) return null
        const payloadBase64 = extractBase64FromDataUrl(image.dataUrl)
        if (!payloadBase64) return null
        return {
          kind: 'image-inline',
          id: message.id,
          createdAt: message.createdAt,
          payloadBase64,
          name: image.name,
          mime: image.mime,
          size: image.size,
          width: image.width,
          height: image.height
        }
      }
      if (!message.text.trim()) return null
      return {
        kind: 'message',
        id: message.id,
        text: message.text,
        createdAt: message.createdAt
      }
    }

    const createSelfSyncSession = async (identity: DeviceIdentity, device: ContactDevice) => {
      const sessionId = createMessageId()
      const salt = randomBase64(16)
      const key = await deriveSessionKey(identity.privateKey, device.publicKey, decodeBase64(salt), sessionId)
      return { sessionId, salt, key }
    }

    const encryptRelayPayloadForDevice = async (
      payload: Record<string, unknown>,
      recipientId: string,
      device: ContactDevice
    ) => {
      const identity = options.identityRef.value
      if (!identity) return null
      const signalEnvelope = await encryptSignalPayload({
        identity,
        recipientId,
        recipientDeviceId: device.deviceId,
        relayUrls: device.relayUrls,
        payload
      })
      if (signalEnvelope) {
        return { payload: signalEnvelope, sessionId: undefined as string | undefined }
      }
      const session = await createSelfSyncSession(identity, device)
      const encrypted = await encryptPayload(
        session.key,
        JSON.stringify(payload),
        session.sessionId,
        session.salt,
        identity.deviceId
      )
      return { payload: encrypted, sessionId: session.sessionId }
    }

    const sendSelfSyncPayload = async (
      payload: Record<string, unknown>,
      messageId: string,
      author: 'self' | 'contact'
    ) => {
      const identity = options.identityRef.value
      const selfUserId = options.selfUserId.value
      if (!identity || !selfUserId) return
      const devices = await fetchSelfDevices()
      const targets = devices.filter((device) => device.deviceId !== identity.deviceId)
      if (!targets.length) return
      const manager = await getSelfRelayManager()
      if (!manager || !manager.clients.length) return
      await Promise.all(
        targets.map(async (device) => {
          try {
            const encrypted = await encryptRelayPayloadForDevice(payload, selfUserId, device)
            if (!encrypted) return
            await manager.send({
              recipientId: selfUserId,
              messageId: `sync:${messageId}:${device.deviceId}`,
              sessionId: encrypted.sessionId,
              payload: { kind: 'sync', contactId: contact.id, author, payload: encrypted.payload },
              deviceIds: [device.deviceId],
              senderId: selfUserId,
              senderDeviceId: identity.deviceId,
              recipientRelayKey: device.relayPublicKey
            })
          } catch {
            // ignore self sync failures
          }
        })
      )
    }

    const requestProfileUpdate = async (meta: ProfileMeta, _targetDeviceId?: string) => {
      if (channel && channel.readyState === 'open') {
        await sendProfilePayload({ kind: 'profile-request', meta })
        return
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

    const resolveCrdtRoomName = () => {
      const selfUserId = options.selfUserId.value
      if (!selfUserId) return null
      return buildCrdtRoomName(selfUserId, contact.id)
    }

    const ensureCrdtReplication = async (identity: DeviceIdentity) => {
      const selfUserId = options.selfUserId.value
      if (!selfUserId) return
      await ensureCrdtProvider(contact.id, identity, selfUserId)
    }

    const sendCrdtKey = async (identity: DeviceIdentity, key: string, roomName: string) => {
      const session = options.sessionRef.value
      const activeChannel = options.channelRef.value ?? channel
      if (!session || !activeChannel || activeChannel.readyState !== 'open') return
      try {
        const payload = await encryptPayload(
          session.key,
          JSON.stringify({ kind: 'crdt-key', key, room: roomName }),
          session.sessionId,
          session.salt,
          identity.deviceId
        )
        activeChannel.send(JSON.stringify({ type: 'message', payload }))
      } catch {
        // ignore crdt key send failures
      }
    }

    const requestCrdtKey = async (identity: DeviceIdentity, roomName: string) => {
      const session = options.sessionRef.value
      const activeChannel = options.channelRef.value ?? channel
      if (!session || !activeChannel || activeChannel.readyState !== 'open') return
      try {
        const payload = await encryptPayload(
          session.key,
          JSON.stringify({ kind: 'crdt-key-request', room: roomName }),
          session.sessionId,
          session.salt,
          identity.deviceId
        )
        activeChannel.send(JSON.stringify({ type: 'message', payload }))
      } catch {
        // ignore request failures
      }
    }

    const maybeInitCrdtKey = async (identity: DeviceIdentity, remoteDevice: ContactDevice) => {
      const roomName = resolveCrdtRoomName()
      if (!roomName) return
      const isLeader = identity.deviceId.localeCompare(remoteDevice.deviceId) < 0
      const current = await loadReplicationKey(contact.id, identity)
      if (current) {
        await ensureCrdtReplication(identity)
        if (isLeader) {
          await sendCrdtKey(identity, current, roomName)
        }
        return
      }
      if (isLeader) {
        const next = await ensureReplicationKey(contact.id, identity, { generate: true })
        if (!next) return
        await ensureCrdtReplication(identity)
        await sendCrdtKey(identity, next, roomName)
        return
      }
      await requestCrdtKey(identity, roomName)
    }

    const applySessionHandshake = async (payload: Record<string, unknown>) => {
      const identity = options.identityRef.value
      if (!identity) return
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
      const salt = typeof payload.salt === 'string' ? payload.salt : ''
      const fromDeviceId = typeof payload.fromDeviceId === 'string' ? payload.fromDeviceId : ''
      if (!sessionId || !salt || !fromDeviceId) return
      const remoteDevice = await resolveContactDevice(fromDeviceId)
      if (!remoteDevice) return
      options.remoteDeviceRef.value = noSerialize(remoteDevice)
      const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
      options.sessionRef.value = noSerialize({
        sessionId,
        salt,
        key,
        remoteDeviceId: remoteDevice.deviceId
      })
      await maybeInitCrdtKey(identity, remoteDevice)
      const activeChannel = options.channelRef.value ?? channel
      if (activeChannel && activeChannel.readyState === 'open') {
        if (options.chatSettings.value.typingIndicators && options.dmInput.value.trim()) {
          void options.sendTyping('start')
        }
        void sendProfileMeta()
        void flushOutbox()
        void pullMailbox()
      }
    }

    const sendSessionHandshake = async (next: DmDataChannel, identity: DeviceIdentity, remoteDevice: ContactDevice) => {
      const sessionId = createMessageId()
      const salt = randomBase64(16)
      const key = await deriveSessionKey(identity.privateKey, remoteDevice.publicKey, decodeBase64(salt), sessionId)
      options.sessionRef.value = noSerialize({
        sessionId,
        salt,
        key,
        remoteDeviceId: remoteDevice.deviceId
      })
      next.send(JSON.stringify({ type: 'session', sessionId, salt, fromDeviceId: identity.deviceId }))
      await maybeInitCrdtKey(identity, remoteDevice)
    }

    const setupChannel = (next: DmDataChannel, opts?: { initiator?: boolean }) => {
      channel = next
      options.channelRef.value = noSerialize(next)
      if ('binaryType' in next) {
        next.binaryType = 'arraybuffer'
      }
      next.onopen = async () => {
        reconnectAttempt = 0
        debug('data channel open', next.label)
        options.dmStatus.value = 'connected'
        clearOfferTimeouts()
        const identity = options.identityRef.value
        const remoteDevice = options.remoteDeviceRef.value
        if (identity && remoteDevice && opts?.initiator) {
          await sendSessionHandshake(next, identity, remoteDevice)
        }
        if (identity && remoteDevice) {
          void maybeInitCrdtKey(identity, remoteDevice)
        }
        if (!options.sessionRef.value) {
          return
        }
        if (options.chatSettings.value.typingIndicators && options.dmInput.value.trim()) {
          void options.sendTyping('start')
        }
        void sendProfileMeta()
        void flushOutbox()
        void pullMailbox()
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
          if (event.data instanceof ArrayBuffer || event.data instanceof Blob || ArrayBuffer.isView(event.data)) {
            const buffer = event.data instanceof Blob
              ? await event.data.arrayBuffer()
              : event.data instanceof ArrayBuffer
                ? event.data
                : event.data.buffer.slice(event.data.byteOffset, event.data.byteOffset + event.data.byteLength)
            const envelope = decodeBinaryEnvelope(buffer)
            if (!envelope) return
            const session = options.sessionRef.value
            if (!session) return
            const plaintextBytes = await decryptPayloadBinary(session.key, envelope)
            const decoded = decodeBinaryMessage(plaintextBytes)
            if (!decoded || !isRecord(decoded.header)) return
            if (decoded.header.kind !== 'image-chunk-bin') return
            const id = typeof decoded.header.id === 'string' ? decoded.header.id : ''
            const index = Number(decoded.header.index)
            const total = Number(decoded.header.total)
            if (!id || !Number.isFinite(index) || !Number.isFinite(total)) return
            const message = await storeImageChunkBinary({ id, index, total, data: decoded.data }, 'contact')
            if (message && appendIncomingMessage(message)) {
              const identity = options.identityRef.value
              if (identity) {
                void persistHistory(contact.id, identity, options.dmMessages.value)
              }
              await sendReceipt(
                session.key,
                session.sessionId,
                session.salt,
                message.id,
                options.chatSettings.value.readReceipts ? 'read' : 'sent'
              )
            }
            return
          }

          let parsed: unknown = event.data
          if (typeof parsed === 'string') {
            try {
              parsed = JSON.parse(parsed)
            } catch {
              return
            }
          }
          if (!isRecord(parsed)) return
          if (parsed.type === 'session') {
            await applySessionHandshake(parsed)
            return
          }
          if (parsed.type !== 'message') return
          const encrypted = resolveEncryptedPayload(parsed.payload)
          if (!encrypted) return
          await handleEncryptedPayload(encrypted, { source: 'contact', author: 'contact' })
        } catch (error) {
          reportDmError(error instanceof Error ? error.message : 'Unable to decrypt message.')
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
    }

    const ensurePeerConnection = (identity: DeviceIdentity, remoteDevice: ContactDevice) => {
      if (connection) return
      isPolite = identity.deviceId.localeCompare(remoteDevice.deviceId) > 0
      connection = new RTCPeerConnection({
        iceServers: resolvedIceServers
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
        void sendSignal(signal)
      }
      connection.onconnectionstatechange = applyConnectionState
      connection.oniceconnectionstatechange = () => {
        if (!connection) return
        const iceState = connection.iceConnectionState
        debug('ice connection state', iceState)
        if (iceState === 'connected' || iceState === 'completed') {
          iceRestartAttempts = 0
          options.dmStatus.value = 'connected'
        } else if (iceState === 'failed' || iceState === 'disconnected') {
          void handleConnectionFailure(`ice-${iceState}`)
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
        setupChannel(wrapRtcDataChannel(event.channel))
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
      const remoteDevice = fromDeviceId
        ? await resolveContactDevice(fromDeviceId)
        : options.remoteDeviceRef.value ?? null
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
        void sendSignal({
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
          clearOfferTimeout(sessionId ?? currentSessionId)
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

    const attemptIceRestart = async (reason: string) => {
      if (!connection || iceRestarting || makingOffer) return false
      const identity = options.identityRef.value
      const remoteDevice = options.remoteDeviceRef.value
      const session = options.sessionRef.value
      if (!identity || !remoteDevice || !session) return false
      if (connection.signalingState !== 'stable') return false
      if (iceRestartAttempts >= 2) return false
      iceRestartAttempts += 1
      iceRestarting = true
      debug('ice restart', { reason, attempt: iceRestartAttempts })
      try {
        if (typeof connection.restartIce === 'function') {
          connection.restartIce()
        }
        makingOffer = true
        const offer = await connection.createOffer({ iceRestart: true })
        await connection.setLocalDescription(offer)
        await waitForIceGatheringComplete(connection)
        void sendSignal({
          type: 'signal',
          to: contact.id,
          toDeviceId: remoteDevice.deviceId,
          sessionId: session.sessionId,
          payload: {
            type: 'offer',
            sdp: connection.localDescription?.sdp ?? offer.sdp,
            salt: session.salt,
            iceRestart: true
          }
        })
        startOfferTimeout(session.sessionId)
        return true
      } catch {
        return false
      } finally {
        makingOffer = false
        iceRestarting = false
      }
    }

    const handleConnectionFailure = async (reason: string) => {
      const restarted = await attemptIceRestart(reason)
      if (restarted) return
      await scheduleReconnect(reason)
    }

    const connectWs = (identity: DeviceIdentity) => {
      if (skipServer) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        options.dmStatus.value = 'offline'
        wsReconnectPending = true
        debug('ws connect deferred (offline)', { reason: 'offline' })
        return
      }
      const serverBackoffMs = getServerBackoffMs(serverKey)
      if (serverBackoffMs > 0) {
        const activeChannel = options.channelRef.value ?? channel
        const channelOpen = activeChannel?.readyState === 'open'
        if (!channelOpen) {
          options.dmStatus.value = 'offline'
        }
        wsReconnectPending = true
        const selfUserId = options.selfUserId.value
        if (selfUserId && isCrdtSignalingBackoff()) {
          destroyCrdtProvider(contact.id, identity, selfUserId)
        }
        if (wsReconnectTimer === null) {
          wsReconnectTimer = window.setTimeout(() => {
            wsReconnectTimer = null
            wsReconnectPending = false
            connectWs(identity)
          }, serverBackoffMs)
        }
        debug('ws connect deferred (server backoff)', { wait: serverBackoffMs })
        return
      }
      const wsUrl = buildWsUrl('/chat/p2p/ws', window.location.origin)
      if (!wsUrl) return
      ws?.close()
      if (wsHeartbeatTimer !== null) {
        window.clearInterval(wsHeartbeatTimer)
        wsHeartbeatTimer = null
      }
      if (wsPongTimer !== null) {
        window.clearTimeout(wsPongTimer)
        wsPongTimer = null
      }
      wsHealthy = false
      let failureRecorded = false
      const recordFailure = () => {
        if (failureRecorded) return
        failureRecorded = true
        markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
      }
      ws = new WebSocket(wsUrl)
      const startHeartbeat = () => {
        if (wsHeartbeatTimer !== null) {
          window.clearInterval(wsHeartbeatTimer)
        }
        wsHeartbeatTimer = window.setInterval(() => {
          if (ws?.readyState !== WebSocket.OPEN) return
          ws.send(JSON.stringify({ type: 'ping' }))
          if (wsPongTimer !== null) {
            window.clearTimeout(wsPongTimer)
          }
          wsPongTimer = window.setTimeout(() => {
            wsPongTimer = null
            wsHealthy = false
            scheduleWsReconnect(identity, 'ws-heartbeat-timeout')
          }, wsHeartbeatTimeoutMs)
        }, wsHeartbeatIntervalMs)
      }
      const stopHeartbeat = () => {
        if (wsHeartbeatTimer !== null) {
          window.clearInterval(wsHeartbeatTimer)
          wsHeartbeatTimer = null
        }
        if (wsPongTimer !== null) {
          window.clearTimeout(wsPongTimer)
          wsPongTimer = null
        }
      }
      ws.addEventListener('open', () => {
        debug('ws open')
        markServerSuccess(serverKey)
        wsHealthy = true
        wsReconnectAttempt = 0
        wsReconnectPending = false
        if (wsReconnectTimer !== null) {
          window.clearTimeout(wsReconnectTimer)
          wsReconnectTimer = null
        }
        ws?.send(JSON.stringify({ type: 'hello', deviceId: identity.deviceId }))
        while (pendingSignals.length) {
          const signal = pendingSignals.shift()
          if (!signal) break
          ws?.send(JSON.stringify(signal))
        }
        startHeartbeat()
        void pullMailbox()
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
        if (payloadType === 'pong') {
          if (wsPongTimer !== null) {
            window.clearTimeout(wsPongTimer)
            wsPongTimer = null
          }
          return
        }
        if (payloadType === 'ping') {
          ws?.send(JSON.stringify({ type: 'pong' }))
          return
        }
        if (payloadType === 'error') {
          const message = typeof payload.error === 'string' ? payload.error : ''
          if (message === 'Unknown device') {
            try {
              const nextIdentity = await options.registerIdentity()
              if (!active) return
              options.identityRef.value = noSerialize(nextIdentity)
              connectWs(nextIdentity)
            } catch {
              // ignore registration failures
            }
            return
          }
        }
        if (payloadType === 'p2p:signal' && fromId === contact.id) {
          try {
            await handleSignal(payload)
          } catch (error) {
            reportDmError(
              error instanceof Error
                ? error.message
                : options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Error'
            )
          }
          return
        }
        if (payloadType === 'p2p:mailbox') {
          const deviceIds = Array.isArray(payload.deviceIds) ? payload.deviceIds : []
          if (deviceIds.length && !deviceIds.includes(identity.deviceId)) return
          void pullMailbox()
        }
      })
      ws.addEventListener('close', () => {
        debug('ws close')
        wsHealthy = false
        stopHeartbeat()
        if (!active) return
        recordFailure()
        const activeChannel = options.channelRef.value ?? channel
        const channelOpen = activeChannel?.readyState === 'open'
        const connectionState = connection?.connectionState
        const iceState = connection?.iceConnectionState
        if (
          channelOpen ||
          connectionState === 'connected' ||
          iceState === 'connected' ||
          iceState === 'completed'
        ) {
          options.dmStatus.value = 'connected'
        } else if (options.dmStatus.value === 'connected') {
          options.dmStatus.value = 'offline'
        }
        scheduleWsReconnect(identity, 'ws-close')
        void maybeStartPeerJsFallback(identity, 'ws-close')
      })
      ws.addEventListener('error', () => {
        debug('ws error')
        wsHealthy = false
        stopHeartbeat()
        recordFailure()
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          options.dmStatus.value = 'offline'
        } else {
          reportDmError(options.fragmentCopy.value?.['Unable to deliver message.'] ?? 'Error', 'offline')
        }
        scheduleWsReconnect(identity, 'ws-error')
        void maybeStartPeerJsFallback(identity, 'ws-error')
      })
    }

    const startCaller = async (identity: DeviceIdentity, remoteDevice: ContactDevice) => {
      isPolite = identity.deviceId.localeCompare(remoteDevice.deviceId) > 0
      ensurePeerConnection(identity, remoteDevice)
      if (!connection) return
      debug('starting caller', { remoteDeviceId: remoteDevice.deviceId })
      const nextChannel = wrapRtcDataChannel(connection.createDataChannel('dm', { ordered: true }))
      channel = nextChannel
      setupChannel(nextChannel)
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
        void sendSignal({
          type: 'signal',
          to: contact.id,
          toDeviceId: remoteDevice.deviceId,
          sessionId,
          payload: { type: 'offer', sdp: connection.localDescription?.sdp ?? offer.sdp, salt }
        })
        startOfferTimeout(sessionId)
      } finally {
        makingOffer = false
      }
    }

    void (async () => {
      try {
        const identity = await options.registerIdentity()
        if (!active) return
        const archiveStamp = await loadHistoryArchiveStamp(contact.id, identity)
        options.historySuppressed.value = archiveStamp !== null
        const cached = await loadHistory(contact.id, identity)
        if (!active) return
        historyNeeded = cached.length === 0 && archiveStamp === null
        if (cached.length) {
          options.dmMessages.value = cached
        }
        void ensureCrdtReplication(identity)
        const attemptBootstrap = async (targets: ContactDevice[]) => {
          const target = pickPreferredDevice(targets)
          if (!target) {
            options.dmStatus.value = 'offline'
            return false
          }
          options.remoteDeviceRef.value = noSerialize(target)
          connectWs(identity)
          if (peerJsEnabled) {
            void ensurePeerJsReady(identity)
          }
          void pullMailbox()
          await requestHistory(identity)
          const shouldInitiate = identity.deviceId.localeCompare(target.deviceId) < 0
          if (shouldInitiate) {
            await startCaller(identity, target)
          }
          return true
        }

        const scheduleDeviceRetry = () => {
          if (deviceRetryTimer !== null) return
          deviceRetryAttempt += 1
          const baseDelay = 1500
          const maxDelay = 30_000
          const delay = Math.min(baseDelay * 2 ** (deviceRetryAttempt - 1), maxDelay)
          const jitter = Math.random() * delay * 0.2
          const wait = delay + jitter
          deviceRetryTimer = window.setTimeout(async () => {
            deviceRetryTimer = null
            if (!active) return
            const nextDevices = await fetchDevices()
            if (!active) return
            if (nextDevices.length) {
              deviceRetryAttempt = 0
              const bootstrapped = await attemptBootstrap(nextDevices)
              if (!bootstrapped) {
                scheduleDeviceRetry()
              }
              return
            }
            options.dmStatus.value = 'offline'
            scheduleDeviceRetry()
          }, wait)
          debug('device retry scheduled', { attempt: deviceRetryAttempt, wait })
        }

        const nextDevices = await fetchDevices()
        if (!active) return
        if (!nextDevices.length) {
          options.dmStatus.value = 'offline'
          scheduleDeviceRetry()
          return
        }
        const bootstrapped = await attemptBootstrap(nextDevices)
        if (!bootstrapped) {
          scheduleDeviceRetry()
        }
      } catch (error) {
        options.dmStatus.value = 'error'
        options.dmError.value = error instanceof Error ? error.message : 'Unable to start direct message.'
      }
    })()

    ctx.cleanup(() => {
      active = false
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdateEvent)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('prom:network-status', handleNetworkStatus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
      }
      if (deviceRetryTimer !== null) {
        window.clearTimeout(deviceRetryTimer)
        deviceRetryTimer = null
      }
      const identity = options.identityRef.value
      const selfUserId = options.selfUserId.value
      if (identity && selfUserId) {
        destroyCrdtProvider(contact.id, identity, selfUserId)
      }
      closeConnection()
    })
  })
}

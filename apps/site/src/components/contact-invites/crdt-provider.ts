import { WebrtcProvider } from 'y-webrtc'
import { WebsocketClient } from 'lib0/websocket'
import { appConfig } from '../../app-config'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { getServerBackoffMs, isServerBackoffActive } from '../../shared/server-backoff'
import { loadContactMaps, loadReplicationKey } from './crdt-store'

const providers = new Map<string, WebrtcProvider>()
const providerBackoffCleanup = new WeakMap<WebrtcProvider, () => void>()

const patchWebsocketClientSend = () => {
  if (typeof window === 'undefined') return
  const proto = WebsocketClient.prototype as WebsocketClient & { __promSafeSendPatched?: boolean }
  if (proto.__promSafeSendPatched) return
  proto.__promSafeSendPatched = true
  const original = proto.send
  proto.send = function (message: unknown) {
    const ws = this.ws
    if (!ws || ws.readyState !== 1) return
    return original.call(this, message)
  }
}

patchWebsocketClientSend()

const watchProviderBackoff = (provider: WebrtcProvider, signaling: string[] | undefined) => {
  if (typeof window === 'undefined') return
  if (providerBackoffCleanup.has(provider)) return
  const hosts = Array.from(new Set((signaling ?? []).map(resolveHost).filter(Boolean)))
  if (!hosts.length) return

  let timer: number | null = null
  let disposed = false
  let paused = false

  const clearTimer = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  const resolveBackoffWait = () => {
    let next = 0
    hosts.forEach((host) => {
      const wait = getServerBackoffMs(host)
      if (wait > 0 && (next === 0 || wait < next)) {
        next = wait
      }
    })
    return next
  }

  const update = () => {
    if (disposed) return
    clearTimer()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!paused) {
        provider.disconnect()
        paused = true
      }
      return
    }
    const waitMs = resolveBackoffWait()
    if (waitMs > 0) {
      if (!paused) {
        provider.disconnect()
        paused = true
      }
      timer = window.setTimeout(update, waitMs + 50)
      return
    }
    if (paused) {
      provider.connect()
      paused = false
    }
  }

  const handleNetworkStatus = (event: Event) => {
    if (!(event instanceof CustomEvent)) return
    const detail = event.detail as { online?: boolean } | undefined
    if (detail?.online === false) {
      if (!paused) {
        provider.disconnect()
        paused = true
      }
      return
    }
    update()
  }

  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  window.addEventListener('prom:network-status', handleNetworkStatus)
  update()

  const cleanup = () => {
    disposed = true
    clearTimer()
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
    window.removeEventListener('prom:network-status', handleNetworkStatus)
  }

  providerBackoffCleanup.set(provider, cleanup)
}

const resolveSignaling = () => {
  const configured = appConfig.p2pCrdtSignaling ?? []
  if (typeof window === 'undefined') {
    return configured.length ? configured : undefined
  }
  const origin = window.location.origin.replace(/^http/, 'ws')
  const resolved = Array.from(
    new Set(
      configured
        .map((entry) => {
          const trimmed = entry.trim()
          if (!trimmed) return ''
          if (trimmed.startsWith('/')) {
            return `${origin}${trimmed}`
          }
          try {
            return new URL(trimmed).toString()
          } catch {
            return ''
          }
        })
        .filter(Boolean)
    )
  )
  if (resolved.length) return resolved
  return [`${origin}/yjs`]
}

const resolveHost = (value: string) => {
  try {
    return new URL(value).host
  } catch {
    return ''
  }
}

export const isCrdtSignalingBackoff = () => {
  const signals = resolveSignaling()
  if (!signals?.length) return false
  return signals.some((entry) => {
    const host = resolveHost(entry)
    if (!host) return false
    return isServerBackoffActive(host)
  })
}

const filterSignaling = (signals?: string[]) => {
  if (!signals?.length) return signals
  const filtered = signals.filter((entry) => {
    const host = resolveHost(entry)
    if (!host) return false
    return !isServerBackoffActive(host)
  })
  return filtered
}

export const buildCrdtRoomName = (selfUserId: string, contactId: string) => {
  const ids = [selfUserId.trim(), contactId.trim()].filter(Boolean).sort()
  return `prometheus:crdt:${ids.join(':')}`
}

const buildProviderKey = (identity: DeviceIdentity, roomName: string) => `${identity.deviceId}:${roomName}`

export const ensureCrdtProvider = async (contactId: string, identity: DeviceIdentity, selfUserId: string) => {
  if (!selfUserId || !contactId) return null
  const roomName = buildCrdtRoomName(selfUserId, contactId)
  const key = buildProviderKey(identity, roomName)
  const signaling = resolveSignaling()
  const filteredSignaling = filterSignaling(signaling)
  if (filteredSignaling && filteredSignaling.length === 0) {
    const existing = providers.get(key)
    if (existing) {
      providerBackoffCleanup.get(existing)?.()
      providerBackoffCleanup.delete(existing)
      existing.destroy()
      providers.delete(key)
    }
    return null
  }
  const existing = providers.get(key)
  if (existing) {
    watchProviderBackoff(existing, filteredSignaling ?? signaling)
    return existing
  }
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return null
  const password = await loadReplicationKey(contactId, identity)
  if (!password) return null
  const provider = new WebrtcProvider(roomName, maps.doc, {
    password,
    signaling: filteredSignaling ?? signaling,
    peerOpts: { config: { iceServers: appConfig.p2pIceServers } }
  })
  providers.set(key, provider)
  watchProviderBackoff(provider, filteredSignaling ?? signaling)
  return provider
}

export const resetCrdtProvider = async (contactId: string, identity: DeviceIdentity, selfUserId: string) => {
  destroyCrdtProvider(contactId, identity, selfUserId)
  return ensureCrdtProvider(contactId, identity, selfUserId)
}

export const destroyCrdtProvider = (contactId: string, identity: DeviceIdentity, selfUserId: string) => {
  if (!selfUserId || !contactId) return
  const roomName = buildCrdtRoomName(selfUserId, contactId)
  const key = buildProviderKey(identity, roomName)
  const existing = providers.get(key)
  if (!existing) return
  providerBackoffCleanup.get(existing)?.()
  providerBackoffCleanup.delete(existing)
  existing.destroy()
  providers.delete(key)
}

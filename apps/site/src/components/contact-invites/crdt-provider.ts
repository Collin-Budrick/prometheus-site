import { WebrtcProvider } from 'y-webrtc'
import { appConfig } from '../../app-config'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { loadContactMaps, loadReplicationKey } from './crdt-store'

const providers = new Map<string, WebrtcProvider>()

const resolveSignaling = () =>
  appConfig.p2pCrdtSignaling && appConfig.p2pCrdtSignaling.length ? appConfig.p2pCrdtSignaling : undefined

export const buildCrdtRoomName = (selfUserId: string, contactId: string) => {
  const ids = [selfUserId.trim(), contactId.trim()].filter(Boolean).sort()
  return `prometheus:crdt:${ids.join(':')}`
}

const buildProviderKey = (identity: DeviceIdentity, roomName: string) => `${identity.deviceId}:${roomName}`

export const ensureCrdtProvider = async (contactId: string, identity: DeviceIdentity, selfUserId: string) => {
  if (!selfUserId || !contactId) return null
  const roomName = buildCrdtRoomName(selfUserId, contactId)
  const key = buildProviderKey(identity, roomName)
  const existing = providers.get(key)
  if (existing) return existing
  const maps = await loadContactMaps(contactId, identity)
  if (!maps) return null
  const password = await loadReplicationKey(contactId, identity)
  if (!password) return null
  const provider = new WebrtcProvider(roomName, maps.doc, {
    password,
    signaling: resolveSignaling(),
    peerOpts: { config: { iceServers: appConfig.p2pIceServers } }
  })
  providers.set(key, provider)
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
  existing.destroy()
  providers.delete(key)
}

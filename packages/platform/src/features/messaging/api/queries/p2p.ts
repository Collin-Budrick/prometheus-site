import type { ValkeyClientType } from '@valkey/client'
import {
  buildDeviceKey,
  buildMailboxIndexKey,
  buildMailboxKey,
  buildUserDevicesKey,
  p2pMailboxMaxEntries
} from '../constants'
import { isRecord } from '../utils'
import type { P2pDeviceEntry, P2pDeviceRole, P2pPrekey, P2pPrekeyBundle } from '../types'

export const resolveDeviceEntry = (raw: string | null): P2pDeviceEntry | null => {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const deviceId = parsed.deviceId
    const userId = parsed.userId
    const publicKey = parsed.publicKey
    const relayPublicKey = parsed.relayPublicKey
    const relayUrls = parsed.relayUrls
    if (typeof deviceId !== 'string' || typeof userId !== 'string' || !isRecord(publicKey)) return null
    const role: P2pDeviceRole = parsed.role === 'relay' ? 'relay' : 'device'
    const label = typeof parsed.label === 'string' ? parsed.label : undefined
    const relayKey = typeof relayPublicKey === 'string' ? relayPublicKey : undefined
    const relayHints = Array.isArray(relayUrls)
      ? relayUrls.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
      : undefined
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString()
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : createdAt
    return {
      deviceId,
      userId,
      publicKey,
      label,
      role,
      relayPublicKey: relayKey,
      relayUrls: relayHints,
      createdAt,
      updatedAt
    }
  } catch {
    return null
  }
}

export const resolvePrekeyBundle = (raw: string | null): P2pPrekeyBundle | null => {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const deviceId = typeof parsed.deviceId === 'string' ? parsed.deviceId : ''
    const userId = typeof parsed.userId === 'string' ? parsed.userId : ''
    const registrationId = Number(parsed.registrationId)
    const identityKey = typeof parsed.identityKey === 'string' ? parsed.identityKey : ''
    const signedPreKey = isRecord(parsed.signedPreKey) ? parsed.signedPreKey : null
    if (!deviceId || !userId || !Number.isFinite(registrationId) || !identityKey || !signedPreKey) return null
    const signedKeyId = Number(signedPreKey.keyId)
    const signedPublicKey = typeof signedPreKey.publicKey === 'string' ? signedPreKey.publicKey : ''
    const signedSignature = typeof signedPreKey.signature === 'string' ? signedPreKey.signature : ''
    if (!Number.isFinite(signedKeyId) || !signedPublicKey || !signedSignature) return null
    const oneTimePreKeys = Array.isArray(parsed.oneTimePreKeys)
      ? parsed.oneTimePreKeys
          .map((entry) => {
            if (!isRecord(entry)) return null
            const keyId = Number(entry.keyId)
            const publicKey = typeof entry.publicKey === 'string' ? entry.publicKey : ''
            if (!Number.isFinite(keyId) || !publicKey) return null
            return { keyId, publicKey }
          })
          .filter((entry): entry is P2pPrekey => Boolean(entry))
      : undefined
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString()
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : createdAt
    return {
      deviceId,
      userId,
      registrationId,
      identityKey,
      signedPreKey: {
        keyId: signedKeyId,
        publicKey: signedPublicKey,
        signature: signedSignature
      },
      oneTimePreKeys,
      createdAt,
      updatedAt
    }
  } catch {
    return null
  }
}

export const loadUserDevices = async (
  valkey: ValkeyClientType,
  isValkeyReady: () => boolean,
  userId: string
) => {
  if (!isValkeyReady()) return []
  try {
    const deviceIds = await valkey.sMembers(buildUserDevicesKey(userId))
    if (!deviceIds.length) return []
    const payloads = await valkey.mGet(deviceIds.map(buildDeviceKey))
    const devices: P2pDeviceEntry[] = []
    const staleIds: string[] = []
    payloads.forEach((raw, index) => {
      const entry = resolveDeviceEntry(typeof raw === 'string' ? raw : null)
      if (entry) {
        devices.push(entry)
        return
      }
      staleIds.push(deviceIds[index]!)
    })
    if (staleIds.length) {
      await valkey.sRem(buildUserDevicesKey(userId), staleIds)
    }
    return devices
  } catch (error) {
    console.error('Failed to load device registry', error)
    return []
  }
}

export const trimMailbox = async (
  valkey: ValkeyClientType,
  isValkeyReady: () => boolean,
  deviceId: string
) => {
  if (!isValkeyReady()) return
  try {
    const indexKey = buildMailboxIndexKey(deviceId)
    const count = await valkey.zCard(indexKey)
    if (count <= p2pMailboxMaxEntries) return
    const overflow = count - p2pMailboxMaxEntries
    const staleIds = await valkey.zRange(indexKey, 0, overflow - 1)
    if (!staleIds.length) return
    await valkey.hDel(buildMailboxKey(deviceId), staleIds)
    await valkey.zRem(indexKey, staleIds)
  } catch (error) {
    console.error('Failed to trim mailbox', error)
  }
}

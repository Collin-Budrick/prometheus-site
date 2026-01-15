import type { DeviceIdentity } from '../../shared/p2p-crypto'
import type { ContactDevice } from './types'

type DeviceRegistryEntry = {
  key: string
  userId: string
  deviceId: string
  device: ContactDevice
}

type DeviceRegistryMeta = {
  userId: string
  updatedAt: string
}

const dbName = 'chat:p2p:devices'
const deviceStore = 'devices'
const metaStore = 'meta'

const ensureBrowser = () => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('Device registry unavailable')
  }
}

const openDeviceRegistryDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(deviceStore)) {
        const store = db.createObjectStore(deviceStore, { keyPath: 'key' })
        store.createIndex('userId', 'userId', { unique: false })
      }
      if (!db.objectStoreNames.contains(metaStore)) {
        db.createObjectStore(metaStore, { keyPath: 'userId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

const buildDeviceKey = (userId: string, deviceId: string) => `${userId}:${deviceId}`

export const buildLocalDeviceEntry = (identity: DeviceIdentity, relayUrls?: string[]): ContactDevice => {
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

export const loadDeviceRegistry = async (userId: string) => {
  if (!userId) return null
  ensureBrowser()
  const db = await openDeviceRegistryDb()
  const tx = db.transaction([deviceStore, metaStore], 'readonly')
  const store = tx.objectStore(deviceStore)
  const index = store.index('userId')
  const entries = (await requestToPromise(index.getAll(userId))) as DeviceRegistryEntry[]
  const meta = (await requestToPromise(tx.objectStore(metaStore).get(userId))) as DeviceRegistryMeta | undefined
  await transactionDone(tx)
  const devices = entries.map((entry) => entry.device).filter((device) => device?.deviceId)
  if (!devices.length && !meta?.updatedAt) return null
  return { devices, updatedAt: meta?.updatedAt ?? null }
}

export const saveDeviceRegistry = async (userId: string, devices: ContactDevice[]) => {
  if (!userId) return
  ensureBrowser()
  const db = await openDeviceRegistryDb()
  const tx = db.transaction([deviceStore, metaStore], 'readwrite')
  const store = tx.objectStore(deviceStore)
  const index = store.index('userId')
  const existingKeys = (await requestToPromise(index.getAllKeys(userId))) as string[]
  const nextKeys = new Set(devices.map((device) => buildDeviceKey(userId, device.deviceId)))
  for (const key of existingKeys) {
    if (!nextKeys.has(key)) {
      store.delete(key)
    }
  }
  for (const device of devices) {
    store.put({
      key: buildDeviceKey(userId, device.deviceId),
      userId,
      deviceId: device.deviceId,
      device
    })
  }
  tx.objectStore(metaStore).put({ userId, updatedAt: new Date().toISOString() } satisfies DeviceRegistryMeta)
  await transactionDone(tx)
}

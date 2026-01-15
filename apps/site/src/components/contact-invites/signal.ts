import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type Direction,
  type KeyPairType,
  type StorageType
} from '@privacyresearch/libsignal-protocol-typescript'
import type { DeviceIdentity } from '../../shared/p2p-crypto'
import { buildApiUrl, resolveApiHost } from './api'
import { markServerFailure, markServerSuccess, shouldAttemptServer } from '../../shared/server-backoff'
import { fetchRelayPrekeys, publishRelayPrekeys } from './relay-directory'
import { isRecord } from './utils'

type SignalEnvelope = {
  kind: 'signal'
  type: number
  body: string
  senderDeviceId?: string
}

type RemotePrekeyBundle = {
  deviceId: string
  registrationId: number
  identityKey: string
  signedPreKey: {
    keyId: number
    publicKey: string
    signature: string
  }
  oneTimePreKey?: {
    keyId: number
    publicKey: string
  }
}

type LocalPrekeyBundle = {
  registrationId: number
  identityKey: string
  signedPreKey: {
    keyId: number
    publicKey: string
    signature: string
  }
  oneTimePreKeys: Array<{
    keyId: number
    publicKey: string
  }>
}

const preKeyMinCount = 5
const preKeyTargetCount = 20
const storeName = 'kv'
const storeCache = new Map<string, Promise<SignalStore>>()

const ensureBrowser = () => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('Signal storage unavailable')
  }
}

const bufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const base64ToBuffer = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

const buffersEqual = (a: ArrayBuffer, b: ArrayBuffer) => {
  if (a.byteLength !== b.byteLength) return false
  const viewA = new Uint8Array(a)
  const viewB = new Uint8Array(b)
  for (let i = 0; i < viewA.length; i += 1) {
    if (viewA[i] !== viewB[i]) return false
  }
  return true
}

const openSignalDb = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
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

class SignalStore implements StorageType {
  private dbPromise: Promise<IDBDatabase>

  constructor(dbPromise: Promise<IDBDatabase>) {
    this.dbPromise = dbPromise
  }

  private async read<T>(key: string): Promise<T | undefined> {
    const db = await this.dbPromise
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const result = await requestToPromise(store.get(key))
    await transactionDone(tx)
    return result as T | undefined
  }

  private async write(key: string, value: unknown): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    await requestToPromise(store.put(value, key))
    await transactionDone(tx)
  }

  private async remove(key: string): Promise<void> {
    const db = await this.dbPromise
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    await requestToPromise(store.delete(key))
    await transactionDone(tx)
  }

  private async readNumberList(key: string) {
    const value = await this.read<unknown>(key)
    if (!Array.isArray(value)) return []
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
  }

  private async writeNumberList(key: string, values: number[]) {
    await this.write(key, values)
  }

  async getIdentityKeyPair() {
    return this.read<KeyPairType>('identityKeyPair')
  }

  async getLocalRegistrationId() {
    const value = await this.read<unknown>('registrationId')
    return typeof value === 'number' ? value : undefined
  }

  async isTrustedIdentity(_identifier: string, _identityKey: ArrayBuffer, _direction: Direction) {
    const identifier = _identifier
    const identityKey = _identityKey
    const stored = await this.read<ArrayBuffer>(`identity:${identifier}`)
    if (!stored) return true
    return buffersEqual(stored, identityKey)
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer, _nonblockingApproval?: boolean) {
    const key = `identity:${encodedAddress}`
    const stored = await this.read<ArrayBuffer>(key)
    const changed = stored ? !buffersEqual(stored, publicKey) : false
    await this.write(key, publicKey)
    return changed
  }

  async loadPreKey(encodedAddress: string | number) {
    return this.read<KeyPairType>(`preKey:${encodedAddress}`)
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType) {
    const id = Number(keyId)
    await this.write(`preKey:${id}`, keyPair)
    const ids = await this.readNumberList('preKeyIds')
    if (!ids.includes(id)) {
      ids.push(id)
      await this.writeNumberList('preKeyIds', ids)
    }
  }

  async removePreKey(keyId: number | string) {
    const id = Number(keyId)
    await this.remove(`preKey:${id}`)
    const ids = await this.readNumberList('preKeyIds')
    const next = ids.filter((entry) => entry !== id)
    if (next.length !== ids.length) {
      await this.writeNumberList('preKeyIds', next)
    }
  }

  async storeSession(encodedAddress: string, record: string) {
    await this.write(`session:${encodedAddress}`, record)
  }

  async loadSession(encodedAddress: string) {
    return this.read<string>(`session:${encodedAddress}`)
  }

  async loadSignedPreKey(keyId: number | string) {
    return this.read<KeyPairType>(`signedPreKey:${keyId}`)
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType) {
    await this.write(`signedPreKey:${keyId}`, keyPair)
    await this.write('signedPreKeyId', Number(keyId))
  }

  async removeSignedPreKey(keyId: number | string) {
    await this.remove(`signedPreKey:${keyId}`)
    const current = await this.read<unknown>('signedPreKeyId')
    if (typeof current === 'number' && current === Number(keyId)) {
      await this.remove('signedPreKeyId')
    }
  }

  async getSignedPreKeySignature(keyId: number) {
    return this.read<ArrayBuffer>(`signedPreKeySig:${keyId}`)
  }

  async setSignedPreKeySignature(keyId: number, signature: ArrayBuffer) {
    await this.write(`signedPreKeySig:${keyId}`, signature)
  }

  async getPreKeyIds() {
    return this.readNumberList('preKeyIds')
  }

  async setRegistrationId(registrationId: number) {
    await this.write('registrationId', registrationId)
  }

  async setIdentityKeyPair(identityKeyPair: KeyPairType) {
    await this.write('identityKeyPair', identityKeyPair)
  }

  async getSignedPreKeyId() {
    const value = await this.read<unknown>('signedPreKeyId')
    return typeof value === 'number' ? value : undefined
  }

  async getPreKeyIndex() {
    const value = await this.read<unknown>('preKeyIndex')
    return typeof value === 'number' ? value : 1
  }

  async setPreKeyIndex(nextIndex: number) {
    await this.write('preKeyIndex', nextIndex)
  }

  async getSignedPreKeyIndex() {
    const value = await this.read<unknown>('signedPreKeyIndex')
    return typeof value === 'number' ? value : 1
  }

  async setSignedPreKeyIndex(nextIndex: number) {
    await this.write('signedPreKeyIndex', nextIndex)
  }
}

const getSignalStore = async (deviceId: string) => {
  ensureBrowser()
  const existing = storeCache.get(deviceId)
  if (existing) return existing
  const dbPromise = openSignalDb(`chat:p2p:signal:${deviceId}`)
  const storePromise = dbPromise.then((db) => new SignalStore(Promise.resolve(db)))
  storeCache.set(deviceId, storePromise)
  return storePromise
}

const buildAddress = (userId: string, deviceId: string) =>
  new SignalProtocolAddress(`${userId}:${deviceId}`, 1)

const resolveRemoteBundle = (value: unknown): RemotePrekeyBundle | null => {
  if (!isRecord(value)) return null
  const deviceId = typeof value.deviceId === 'string' ? value.deviceId : ''
  const registrationId = Number(value.registrationId)
  const identityKey = typeof value.identityKey === 'string' ? value.identityKey : ''
  if (!deviceId || !Number.isFinite(registrationId) || !identityKey) return null
  if (!isRecord(value.signedPreKey)) return null
  const signedPreKey = value.signedPreKey
  const keyId = Number(signedPreKey.keyId)
  const publicKey = typeof signedPreKey.publicKey === 'string' ? signedPreKey.publicKey : ''
  const signature = typeof signedPreKey.signature === 'string' ? signedPreKey.signature : ''
  if (!Number.isFinite(keyId) || !publicKey || !signature) return null
  let oneTimePreKey: RemotePrekeyBundle['oneTimePreKey']
  if (isRecord(value.oneTimePreKey)) {
    const preKeyId = Number(value.oneTimePreKey.keyId)
    const preKeyPublic = typeof value.oneTimePreKey.publicKey === 'string' ? value.oneTimePreKey.publicKey : ''
    if (Number.isFinite(preKeyId) && preKeyPublic) {
      oneTimePreKey = { keyId: preKeyId, publicKey: preKeyPublic }
    }
  }
  return {
    deviceId,
    registrationId,
    identityKey,
    signedPreKey: { keyId, publicKey, signature },
    oneTimePreKey
  }
}

const convertRemoteBundle = (bundle: RemotePrekeyBundle) => ({
  identityKey: base64ToBuffer(bundle.identityKey),
  registrationId: bundle.registrationId,
  signedPreKey: {
    keyId: bundle.signedPreKey.keyId,
    publicKey: base64ToBuffer(bundle.signedPreKey.publicKey),
    signature: base64ToBuffer(bundle.signedPreKey.signature)
  },
  preKey: bundle.oneTimePreKey
    ? {
        keyId: bundle.oneTimePreKey.keyId,
        publicKey: base64ToBuffer(bundle.oneTimePreKey.publicKey)
      }
    : undefined
})

const buildLocalBundle = async (identity: DeviceIdentity) => {
  const store = await getSignalStore(identity.deviceId)
  let identityKeyPair = await store.getIdentityKeyPair()
  if (!identityKeyPair) {
    identityKeyPair = await KeyHelper.generateIdentityKeyPair()
    await store.setIdentityKeyPair(identityKeyPair)
  }
  let registrationId = await store.getLocalRegistrationId()
  if (!registrationId) {
    registrationId = KeyHelper.generateRegistrationId()
    await store.setRegistrationId(registrationId)
  }
  let signedPreKeyId = await store.getSignedPreKeyId()
  let signedPreKey = signedPreKeyId ? await store.loadSignedPreKey(signedPreKeyId) : undefined
  let signedSignature = signedPreKeyId ? await store.getSignedPreKeySignature(signedPreKeyId) : undefined
  if (!signedPreKey || !signedSignature || signedPreKeyId === undefined) {
    const nextId = await store.getSignedPreKeyIndex()
    const generated = await KeyHelper.generateSignedPreKey(identityKeyPair, nextId)
    signedPreKeyId = generated.keyId
    signedPreKey = generated.keyPair
    signedSignature = generated.signature
    await store.storeSignedPreKey(signedPreKeyId, signedPreKey)
    await store.setSignedPreKeySignature(signedPreKeyId, signedSignature)
    await store.setSignedPreKeyIndex(nextId + 1)
  }
  let preKeyIds = await store.getPreKeyIds()
  if (preKeyIds.length < preKeyMinCount) {
    const nextIndex = await store.getPreKeyIndex()
    const needed = Math.max(0, preKeyTargetCount - preKeyIds.length)
    const generatedIds: number[] = []
    for (let i = 0; i < needed; i += 1) {
      const keyId = nextIndex + i
      const preKey = await KeyHelper.generatePreKey(keyId)
      await store.storePreKey(preKey.keyId, preKey.keyPair)
      generatedIds.push(preKey.keyId)
    }
    await store.setPreKeyIndex(nextIndex + needed)
    if (generatedIds.length) {
      preKeyIds = [...preKeyIds, ...generatedIds]
    }
  }
  const oneTimePreKeys: LocalPrekeyBundle['oneTimePreKeys'] = []
  for (const keyId of preKeyIds) {
    const keyPair = await store.loadPreKey(keyId)
    if (!keyPair) continue
    oneTimePreKeys.push({ keyId, publicKey: bufferToBase64(keyPair.pubKey) })
  }
  return {
    store,
    bundle: {
      registrationId,
      identityKey: bufferToBase64(identityKeyPair.pubKey),
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: bufferToBase64(signedPreKey.pubKey),
        signature: bufferToBase64(signedSignature)
      },
      oneTimePreKeys
    }
  }
}

const mergeBundles = (bundles: RemotePrekeyBundle[]) => {
  const byDevice = new Map<string, RemotePrekeyBundle>()
  for (const bundle of bundles) {
    if (!bundle.deviceId) continue
    byDevice.set(bundle.deviceId, bundle)
  }
  return Array.from(byDevice.values())
}

const fetchRemoteBundles = async (userId: string, relayUrls?: string[]) => {
  if (typeof window === 'undefined') return []
  const relayBundles = await fetchRelayPrekeys({ userId, relayUrls })
  let apiBundles: RemotePrekeyBundle[] = []
  const serverKey = resolveApiHost(window.location.origin)
  if (!relayBundles.length && shouldAttemptServer(serverKey)) {
    try {
      const response = await fetch(buildApiUrl(`/chat/p2p/prekeys/${userId}`, window.location.origin), {
        credentials: 'include'
      })
      if (response.ok) {
        const payload = (await response.json()) as unknown
        if (isRecord(payload) && Array.isArray(payload.bundles)) {
          apiBundles = payload.bundles.map(resolveRemoteBundle).filter((bundle): bundle is RemotePrekeyBundle => Boolean(bundle))
        }
        markServerSuccess(serverKey)
      } else if (response.status >= 500) {
        markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
      }
    } catch {
      markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
      // ignore API failures
    }
  }
  return mergeBundles([...relayBundles, ...apiBundles])
}

export const resolveSignalEnvelope = (payload: unknown): SignalEnvelope | null => {
  if (!isRecord(payload)) return null
  if (payload.kind !== 'signal') return null
  const type = Number(payload.type)
  const body = typeof payload.body === 'string' ? payload.body : ''
  if (!Number.isFinite(type) || !body) return null
  const senderDeviceId = typeof payload.senderDeviceId === 'string' ? payload.senderDeviceId : undefined
  return { kind: 'signal', type, body, senderDeviceId }
}

export const publishSignalPrekeys = async (identity: DeviceIdentity, userId?: string, relayUrls?: string[]) => {
  if (typeof window === 'undefined') return false
  try {
    const { bundle } = await buildLocalBundle(identity)
    const relayOk =
      userId && userId.trim()
        ? await publishRelayPrekeys({ identity, userId: userId.trim(), bundle, relayUrls })
        : false
    const serverKey = resolveApiHost(window.location.origin)
    if (!shouldAttemptServer(serverKey) || relayOk) return relayOk
    const response = await fetch(buildApiUrl('/chat/p2p/prekeys', window.location.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        deviceId: identity.deviceId,
        registrationId: bundle.registrationId,
        identityKey: bundle.identityKey,
        signedPreKey: bundle.signedPreKey,
        oneTimePreKeys: bundle.oneTimePreKeys
      })
    })
    if (response.ok) {
      markServerSuccess(serverKey)
    } else if (response.status >= 500) {
      markServerFailure(serverKey, { baseDelayMs: 3000, maxDelayMs: 120000 })
    }
    return response.ok || relayOk
  } catch {
    markServerFailure(resolveApiHost(window.location.origin), { baseDelayMs: 3000, maxDelayMs: 120000 })
    return false
  }
}

export const encryptSignalPayload = async (options: {
  identity: DeviceIdentity
  recipientId: string
  recipientDeviceId: string
  relayUrls?: string[]
  payload: Record<string, unknown>
}) => {
  if (typeof window === 'undefined') return null
  const { identity, recipientId, recipientDeviceId, payload } = options
  try {
    const { store } = await buildLocalBundle(identity)
    const address = buildAddress(recipientId, recipientDeviceId)
    const cipher = new SessionCipher(store, address)
    if (!(await cipher.hasOpenSession())) {
      const bundles = await fetchRemoteBundles(recipientId, options.relayUrls)
      const target = bundles.find((entry) => entry.deviceId === recipientDeviceId)
      if (!target) return null
      const builder = new SessionBuilder(store, address)
      await builder.processPreKey(convertRemoteBundle(target))
    }
    const plaintext = new TextEncoder().encode(JSON.stringify(payload)).buffer
    const message = await cipher.encrypt(plaintext)
    if (!message.body) return null
    return {
      kind: 'signal',
      type: message.type,
      body: btoa(message.body),
      senderDeviceId: identity.deviceId
    } satisfies SignalEnvelope
  } catch {
    return null
  }
}

export const decryptSignalPayload = async (options: {
  identity: DeviceIdentity
  senderId: string
  senderDeviceId: string
  envelope: SignalEnvelope
}) => {
  if (typeof window === 'undefined') return null
  const { identity, senderId, senderDeviceId, envelope } = options
  try {
    const { store } = await buildLocalBundle(identity)
    const address = buildAddress(senderId, senderDeviceId)
    const cipher = new SessionCipher(store, address)
    const payload = atob(envelope.body)
    const plaintext =
      envelope.type === 3
        ? await cipher.decryptPreKeyWhisperMessage(payload, 'binary')
        : await cipher.decryptWhisperMessage(payload, 'binary')
    return new TextDecoder().decode(new Uint8Array(plaintext))
  } catch {
    return null
  }
}

export type { SignalEnvelope, RemotePrekeyBundle, LocalPrekeyBundle }

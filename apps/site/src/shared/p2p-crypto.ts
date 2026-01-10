type StoredDeviceIdentity = {
  deviceId: string
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
  role?: 'device' | 'relay'
}

export type DeviceIdentity = {
  deviceId: string
  publicKey: CryptoKey
  privateKey: CryptoKey
  publicKeyJwk: JsonWebKey
  role: 'device' | 'relay'
}

export type EncryptedPayload = {
  version: 1
  sessionId: string
  salt: string
  iv: string
  ciphertext: string
  senderDeviceId?: string
}

const storageKey = 'chat:p2p:identity'

const ensureCrypto = () => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto unavailable')
  }
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const base64ToBytes = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export const loadStoredIdentity = (): StoredDeviceIdentity | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDeviceIdentity
    if (!parsed.deviceId || !parsed.publicKeyJwk || !parsed.privateKeyJwk) return null
    return parsed
  } catch {
    return null
  }
}

export const saveStoredIdentity = (identity: StoredDeviceIdentity) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(identity))
  } catch {
    // ignore storage failures
  }
}

export const createStoredIdentity = async (): Promise<StoredDeviceIdentity> => {
  ensureCrypto()
  const { publicKey, privateKey } = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', publicKey)
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', privateKey)
  const deviceId = crypto.randomUUID()
  return { deviceId, publicKeyJwk, privateKeyJwk, role: 'device' }
}

export const importStoredIdentity = async (stored: StoredDeviceIdentity): Promise<DeviceIdentity> => {
  ensureCrypto()
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    stored.publicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  )
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    stored.privateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  return {
    deviceId: stored.deviceId,
    publicKey,
    privateKey,
    publicKeyJwk: stored.publicKeyJwk,
    role: stored.role === 'relay' ? 'relay' : 'device'
  }
}

export const deriveSessionKey = async (
  privateKey: CryptoKey,
  remotePublicJwk: JsonWebKey,
  salt: Uint8Array,
  sessionId: string
) => {
  ensureCrypto()
  const normalizedSalt = new Uint8Array(salt)
  const saltBuffer = normalizedSalt.buffer as ArrayBuffer
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    remotePublicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const baseKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  const info = new TextEncoder().encode(sessionId)
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBuffer, info },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export const randomBase64 = (length: number) => {
  ensureCrypto()
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytesToBase64(bytes)
}

export const encryptPayload = async (
  key: CryptoKey,
  plaintext: string,
  sessionId: string,
  salt: string,
  senderDeviceId?: string
): Promise<EncryptedPayload> => {
  ensureCrypto()
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return {
    version: 1,
    sessionId,
    salt,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    senderDeviceId
  }
}

export const decryptPayload = async (key: CryptoKey, payload: EncryptedPayload) => {
  ensureCrypto()
  const iv = base64ToBytes(payload.iv)
  const ciphertext = base64ToBytes(payload.ciphertext)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

export const decodeBase64 = (value: string) => base64ToBytes(value)

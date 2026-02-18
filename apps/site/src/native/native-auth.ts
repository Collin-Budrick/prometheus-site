type NativePluginLoader = (_moduleId: string) => Promise<unknown | null>

export type NativeAuthCredentials = {
  username: string
  password: string
  website: string
}

type NativeAuthCredentialInput = {
  username: string
  password: string
  website?: string
}

type NativeAuthCredentialsPayload = {
  username: string
  password: string
  website: string
  updatedAt: number
}

const NATIVE_AUTH_CREDENTIALS_KEY = 'auth:native:credentials:v1'

let nativeRuntimeOverrideForTests: boolean | null = null
let pluginLoaderOverrideForTests: NativePluginLoader | null = null

const getIsNativeRuntime = () => {
  if (nativeRuntimeOverrideForTests !== null) return nativeRuntimeOverrideForTests
  return false
}

const readStorageValue = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorageValue = (key: string, value: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const removeStorageValue = (key: string) => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

const resolveNativeAuthWebsite = (website?: string) => {
  const explicit = website?.trim()
  if (explicit) return explicit
  if (typeof window === 'undefined') return ''
  return window.location.origin || ''
}

const parseCredentialsPayload = (raw: string): NativeAuthCredentialsPayload | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<NativeAuthCredentialsPayload> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.username !== 'string' || !parsed.username.trim()) return null
    if (typeof parsed.password !== 'string' || !parsed.password) return null
    if (typeof parsed.website !== 'string' || !parsed.website.trim()) return null
    if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt) || parsed.updatedAt <= 0) return null
    return {
      username: parsed.username.trim(),
      password: parsed.password,
      website: parsed.website.trim(),
      updatedAt: Math.floor(parsed.updatedAt)
    }
  } catch {
    return null
  }
}

const loadNativeAuthCredentialPayload = async (): Promise<NativeAuthCredentialsPayload | null> => {
  const raw = readStorageValue(NATIVE_AUTH_CREDENTIALS_KEY)
  if (!raw) return null
  const parsed = parseCredentialsPayload(raw)
  if (parsed) return parsed
  removeStorageValue(NATIVE_AUTH_CREDENTIALS_KEY)
  return null
}

export const saveNativeAuthCredentials = async (input: NativeAuthCredentialInput): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  const username = input.username.trim()
  const password = input.password
  const website = resolveNativeAuthWebsite(input.website)
  if (!username || !password || !website) return false

  const payload: NativeAuthCredentialsPayload = {
    username,
    password,
    website,
    updatedAt: Date.now()
  }

  return writeStorageValue(NATIVE_AUTH_CREDENTIALS_KEY, JSON.stringify(payload))
}

export const loadNativeAuthCredentials = async (): Promise<NativeAuthCredentials | null> => {
  if (typeof window === 'undefined') return null
  const payload = await loadNativeAuthCredentialPayload()
  if (!payload) return null
  return {
    username: payload.username,
    password: payload.password,
    website: payload.website
  }
}

export const clearNativeAuthCredentials = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  return removeStorageValue(NATIVE_AUTH_CREDENTIALS_KEY)
}

export const canUseNativeBiometricQuickLogin = async (): Promise<boolean> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false
  return false
}

export const isNativeBiometricAuthSupported = async () => false

export const resolveNativeSocialProviders = async (): Promise<string[]> => {
  if (pluginLoaderOverrideForTests) {
    await pluginLoaderOverrideForTests('social-login')
  }
  return []
}

export const nativeSocialLogin = async (_provider: string): Promise<boolean> => false

export const savePasswordIfSupported = async (
  input: { username: string; password: string; website?: string; displayName?: string }
): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  if (!input.username || !input.password) return false

  const nav = navigator as Navigator & {
    credentials?: {
      store?: (credential: Credential) => Promise<Credential | null>
    }
  }
  if (!nav.credentials?.store) return false

  const ctor = (globalThis as { PasswordCredential?: new (data: unknown) => Credential }).PasswordCredential
  if (!ctor) return false

  try {
    const credential = new ctor({
      id: input.username,
      password: input.password,
      name: input.displayName || 'Prometheus'
    })
    await nav.credentials.store(credential)
    return true
  } catch {
    return false
  }
}

export const requestNativeBiometricAuth = async (
  _options?: { reason?: string; title?: string; fallbackTitle?: string; allowDeviceCredential?: boolean }
): Promise<boolean> => false

export const setNativeAuthRuntimeOverrideForTests = (value: boolean | null) => {
  nativeRuntimeOverrideForTests = value
}

export const setNativeAuthPluginLoaderOverrideForTests = (loader: NativePluginLoader | null) => {
  pluginLoaderOverrideForTests = loader
}

export const resetNativeAuthForTests = () => {
  nativeRuntimeOverrideForTests = null
  pluginLoaderOverrideForTests = null
}

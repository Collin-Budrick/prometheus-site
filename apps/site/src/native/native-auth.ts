import { isNativeCapacitorRuntime } from './runtime'
import { loadNativePlugin } from './capacitor-plugin-loader'

type NativePlugin = Record<string, unknown>
type UnknownRecord = Record<string, unknown>
type ResultTags = Record<string, string>
type NativePluginLoader = (moduleId: string) => Promise<unknown | null>

type BiometricAuthenticateOptions = {
  reason: string
  title?: string
  fallbackTitle?: string
  allowDeviceCredential?: boolean
}

type BiometricPluginAdapter = {
  checkBiometry: () => Promise<unknown>
  authenticate: (options: BiometricAuthenticateOptions) => Promise<unknown>
}

type SecureStoragePluginAdapter = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<boolean>
  remove: (key: string) => Promise<boolean>
}

type NativeAuthCredentialsPayload = {
  username: string
  password: string
  website: string
  updatedAt: number
}

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

const NATIVE_AUTH_CREDENTIALS_KEY = 'auth:native:credentials:v1'

const isObject = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object'

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())
}

const CALL_SUCCESS = Symbol('CALL_SUCCESS')

const resolvePlugin = (value: unknown): NativePlugin | null => {
  if (!isObject(value)) return null
  return value as NativePlugin
}

const normalizePlugin = resolvePlugin

const resolvePluginFromModule = (moduleValue: unknown, candidateKeys: string[]): NativePlugin | null => {
  const moduleRecord = normalizePlugin(moduleValue)
  if (!moduleRecord) return null
  for (const key of candidateKeys) {
    const nested = normalizePlugin(moduleRecord[key])
    if (nested) return nested
  }
  return moduleRecord
}

let nativeRuntimeOverrideForTests: boolean | null = null
let pluginLoaderOverrideForTests: NativePluginLoader | null = null

const getIsNativeRuntime = () => {
  if (nativeRuntimeOverrideForTests !== null) return nativeRuntimeOverrideForTests
  return isNativeCapacitorRuntime()
}

const loadPlugin = async <T>(moduleId: string): Promise<T | null> => {
  if (pluginLoaderOverrideForTests) {
    return (await pluginLoaderOverrideForTests(moduleId)) as T | null
  }
  return loadNativePlugin<T>(moduleId)
}

const callPluginMethod = async (
  plugin: NativePlugin,
  methodName: string,
  args: unknown[] = []
): Promise<unknown> => {
  const method = plugin[methodName]
  if (typeof method !== 'function') return undefined
  const result = await method.call(plugin, ...args)
  if (result === undefined) return CALL_SUCCESS
  return result
}

const callFirstSuccessful = async (
  plugin: NativePlugin,
  methodNames: string[],
  payloadVariants: unknown[][]
): Promise<unknown> => {
  for (const methodName of methodNames) {
    for (const args of payloadVariants) {
      try {
        const result = await callPluginMethod(plugin, methodName, args)
        if (result !== undefined) return result
      } catch {
        // fallback to next signature
      }
    }
  }
  return undefined
}

const evaluateSuccessResult = (result: unknown): boolean => {
  if (result === CALL_SUCCESS) return true
  if (typeof result === 'boolean') return result
  if (typeof result === 'string') return result.length > 0
  if (typeof result === 'number') return Number.isFinite(result) && result >= 0
  if (typeof result === 'object' && result !== null) {
    const parsed = result as ResultTags & {
      success?: unknown
      ok?: unknown
      status?: unknown
      id?: unknown
      authenticated?: unknown
      didAuthenticate?: unknown
      value?: unknown
      code?: unknown
    }
    if (typeof parsed.success === 'boolean') return parsed.success
    if (typeof parsed.ok === 'boolean') return parsed.ok
    if (typeof parsed.authenticated === 'boolean') return parsed.authenticated
    if (typeof parsed.didAuthenticate === 'boolean') return parsed.didAuthenticate
    if (typeof parsed.status === 'string') {
      const status = parsed.status.toLowerCase()
      if (status === 'ok' || status === 'success') return true
      if (status === 'error' || status === 'failed') return false
    }
    if (typeof parsed.value === 'boolean') return parsed.value
    if (typeof parsed.code === 'number') return parsed.code >= 0
    if (parsed.id) return true
  }
  return true
}

const evaluateBiometryAvailability = (result: unknown): boolean => {
  if (result === CALL_SUCCESS) return true
  if (typeof result === 'boolean') return result
  if (!isObject(result)) return false

  const parsed = result as UnknownRecord
  const availableKeys = ['isAvailable', 'available', 'biometryAvailable', 'strongBiometryIsAvailable']
  for (const key of availableKeys) {
    const value = parsed[key]
    if (typeof value === 'boolean') return value
  }

  const hasHardware = parsed.hasHardware
  if (typeof hasHardware === 'boolean' && !hasHardware) return false

  const biometryType = parsed.biometryType
  if (typeof biometryType === 'string') {
    const normalized = biometryType.trim().toLowerCase()
    if (!normalized || normalized === 'none' || normalized === 'unsupported' || normalized === 'unknown') return false
    return true
  }

  return evaluateSuccessResult(result)
}

const parseStorageReadValue = (result: unknown): string | null => {
  if (result === CALL_SUCCESS || result === undefined || result === null) return null
  if (typeof result === 'string') return result
  if (!isObject(result)) return null

  const value = result.value
  if (typeof value === 'string') return value
  if (value === null) return null

  const resultValue = result.result
  if (typeof resultValue === 'string') return resultValue
  if (resultValue === null) return null

  return null
}

const normalizeWriteResult = (result: unknown) => {
  if (result === undefined) return false
  if (result === CALL_SUCCESS) return true
  if (typeof result === 'boolean') return result
  return true
}

const loadBiometricPlugin = async (): Promise<BiometricPluginAdapter | null> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return null

  const moduleValue = await loadPlugin<NativePlugin>('@aparajita/capacitor-biometric-auth')
  const plugin = resolvePluginFromModule(moduleValue, ['BiometricAuth'])
  if (!plugin) return null

  const checkMethods = ['checkBiometry', 'checkBiometrics', 'isAvailable', 'check']
  const authMethods = ['authenticate', 'authenticateWithBiometrics', 'authorize', 'request', 'verify']

  const hasCheckMethod = checkMethods.some((methodName) => typeof plugin[methodName] === 'function')
  const hasAuthMethod = authMethods.some((methodName) => typeof plugin[methodName] === 'function')
  if (!hasAuthMethod && !hasCheckMethod) return null

  return {
    checkBiometry: async () => {
      const result = await callFirstSuccessful(plugin, checkMethods, [[], [{}]])
      return result ?? false
    },
    authenticate: async (options) => {
      const payload = {
        reason: options.reason,
        title: options.title,
        fallbackTitle: options.fallbackTitle,
        allowDeviceCredential: options.allowDeviceCredential,
        deviceCredentialAllowed: options.allowDeviceCredential
      }
      const variants = [
        [payload],
        [options.reason],
        [options.reason, options.title, options.fallbackTitle],
        []
      ]
      const result = await callFirstSuccessful(plugin, authMethods, variants)
      return result ?? false
    }
  } satisfies BiometricPluginAdapter
}

const loadSecureStoragePlugin = async (): Promise<SecureStoragePluginAdapter | null> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return null

  const moduleValue = await loadPlugin<NativePlugin>('@aparajita/capacitor-secure-storage')
  const plugin = resolvePluginFromModule(moduleValue, ['SecureStorage'])
  if (!plugin) return null

  const hasReadMethod = typeof plugin.get === 'function' || typeof plugin.getItem === 'function'
  const hasWriteMethod = typeof plugin.set === 'function' || typeof plugin.setItem === 'function'
  const hasRemoveMethod =
    typeof plugin.remove === 'function' ||
    typeof plugin.removeItem === 'function' ||
    typeof plugin.delete === 'function' ||
    typeof plugin.deleteItem === 'function'

  if (!hasReadMethod || !hasWriteMethod || !hasRemoveMethod) return null

  return {
    get: async (key: string) => {
      const result = await callFirstSuccessful(plugin, ['get', 'getItem'], [[{ key }], [key]])
      return parseStorageReadValue(result)
    },
    set: async (key: string, value: string) => {
      const result = await callFirstSuccessful(plugin, ['set', 'setItem'], [[{ key, value }], [key, value]])
      return normalizeWriteResult(result)
    },
    remove: async (key: string) => {
      const result = await callFirstSuccessful(
        plugin,
        ['remove', 'removeItem', 'delete', 'deleteItem'],
        [[{ key }], [key]]
      )
      return normalizeWriteResult(result)
    }
  } satisfies SecureStoragePluginAdapter
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

const loadNativeAuthCredentialPayload = async (
  storageAdapter?: SecureStoragePluginAdapter
): Promise<NativeAuthCredentialsPayload | null> => {
  const storage = storageAdapter ?? (await loadSecureStoragePlugin())
  if (!storage) return null

  try {
    const raw = await storage.get(NATIVE_AUTH_CREDENTIALS_KEY)
    if (!raw) return null
    const parsed = parseCredentialsPayload(raw)
    if (parsed) return parsed
    await storage.remove(NATIVE_AUTH_CREDENTIALS_KEY)
  } catch {
    // no-op
  }

  return null
}

export const saveNativeAuthCredentials = async (input: NativeAuthCredentialInput): Promise<boolean> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false
  const username = input.username.trim()
  const password = input.password
  const website = resolveNativeAuthWebsite(input.website)
  if (!username || !password || !website) return false

  const storage = await loadSecureStoragePlugin()
  if (!storage) return false

  const payload: NativeAuthCredentialsPayload = {
    username,
    password,
    website,
    updatedAt: Date.now()
  }

  try {
    return await storage.set(NATIVE_AUTH_CREDENTIALS_KEY, JSON.stringify(payload))
  } catch {
    return false
  }
}

export const loadNativeAuthCredentials = async (): Promise<NativeAuthCredentials | null> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return null
  const payload = await loadNativeAuthCredentialPayload()
  if (!payload) return null
  return {
    username: payload.username,
    password: payload.password,
    website: payload.website
  }
}

export const clearNativeAuthCredentials = async (): Promise<boolean> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false
  const storage = await loadSecureStoragePlugin()
  if (!storage) return false
  try {
    return await storage.remove(NATIVE_AUTH_CREDENTIALS_KEY)
  } catch {
    return false
  }
}

export const canUseNativeBiometricQuickLogin = async (): Promise<boolean> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false

  const [biometricPlugin, storagePlugin] = await Promise.all([loadBiometricPlugin(), loadSecureStoragePlugin()])
  if (!biometricPlugin || !storagePlugin) return false

  try {
    const checkResult = await biometricPlugin.checkBiometry()
    if (!evaluateBiometryAvailability(checkResult)) return false
  } catch {
    return false
  }

  const credentials = await loadNativeAuthCredentialPayload(storagePlugin)
  return Boolean(credentials)
}

export const isNativeBiometricAuthSupported = async () => {
  const plugin = await loadBiometricPlugin()
  if (!plugin) return false
  try {
    return evaluateBiometryAvailability(await plugin.checkBiometry())
  } catch {
    return false
  }
}

export const resolveNativeSocialProviders = async (): Promise<string[]> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return []
  const plugin = normalizePlugin(await loadPlugin<NativePlugin>('@capgo/capacitor-social-login'))
  if (!plugin) return []

  const candidates = [
    plugin.providers,
    plugin.provider,
    plugin.providerList,
    plugin.availableProviders,
    plugin.supportedProviders,
    plugin.supportedProviderIds,
    plugin.getSupportedSocialProviders,
    plugin.getAvailableProviders,
    plugin.getProviders
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      try {
        const result = await candidate.call(plugin)
        const parsed = asStringArray(result)
        if (parsed.length > 0) return parsed
      } catch {
        continue
      }
    }
    const parsed = asStringArray(candidate)
    if (parsed.length > 0) return parsed
  }

  const discovered = asStringArray(plugin.supportedProviderIds)
  if (discovered.length > 0) return discovered
  return []
}

export const nativeSocialLogin = async (provider: string): Promise<boolean> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false
  const plugin = normalizePlugin(await loadPlugin<NativePlugin>('@capgo/capacitor-social-login'))
  if (!plugin) return false

  const payload = { provider }
  const normalizedProvider = provider.trim().toLowerCase()
  const variants = [[payload], [{ providerId: normalizedProvider }], [{ provider: normalizedProvider }], [normalizedProvider]]

  const result = await callFirstSuccessful(
    plugin,
    ['signIn', 'signInWithProvider', 'login', 'authenticate', 'authenticateWithProvider', 'authorize'],
    variants
  )

  if (result !== undefined) return evaluateSuccessResult(result)
  return false
}

export const savePasswordIfSupported = async (
  input: { username: string; password: string; website?: string; displayName?: string }
): Promise<boolean> => {
  if (!getIsNativeRuntime() || typeof window === 'undefined') return false
  if (!input.username || !input.password) return false

  const plugin = normalizePlugin(await loadPlugin<NativePlugin>('@capgo/capacitor-autofill-save-password'))
  if (!plugin) return false

  const payload = {
    username: input.username,
    password: input.password,
    website: input.website || window.location.origin,
    displayName: input.displayName || 'Prometheus'
  }

  const variants = [
    [payload],
    [{ credentials: payload }],
    [input.username, input.password, payload.website, payload.displayName],
    [payload.website, input.username, input.password]
  ]

  const result = await callFirstSuccessful(
    plugin,
    ['save', 'savePassword', 'savePasswordCredentials', 'store', 'storePassword', 'set', 'setCredentials'],
    variants
  )

  return result !== undefined
}

export const requestNativeBiometricAuth = async (
  options?: { reason?: string; title?: string; fallbackTitle?: string; allowDeviceCredential?: boolean }
): Promise<boolean> => {
  const plugin = await loadBiometricPlugin()
  if (!plugin) return false

  const optionsPayload: BiometricAuthenticateOptions = {
    reason: options?.reason ?? 'Authenticate to continue',
    title: options?.title,
    fallbackTitle: options?.fallbackTitle,
    allowDeviceCredential: options?.allowDeviceCredential
  }

  try {
    const result = await plugin.authenticate(optionsPayload)
    return evaluateSuccessResult(result)
  } catch {
    return false
  }
}

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

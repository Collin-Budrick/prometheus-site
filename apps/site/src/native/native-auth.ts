import { isNativeCapacitorRuntime } from './runtime'
import { loadNativePlugin } from './capacitor-plugin-loader'

type NativePlugin = Record<string, unknown>

type UnknownRecord = Record<string, unknown>

type ResultTags = Record<string, string>

const isObject = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object'

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
}

const CALL_SUCCESS = Symbol('CALL_SUCCESS')

const resolvePlugin = (value: unknown): NativePlugin | null => {
  if (!isObject(value)) return null
  return value as NativePlugin
}

const loadBiometricPlugin = async () => {
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return null
  return normalizePlugin(await loadNativePlugin<NativePlugin>('@aparajita/capacitor-biometric-auth'))
}

const normalizePlugin = resolvePlugin

export const isNativeBiometricAuthSupported = async () => {
  const plugin = await loadBiometricPlugin()
  return Boolean(plugin)
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

const evaluateSocialResult = (result: unknown): boolean => {
  if (result === CALL_SUCCESS) return true
  if (typeof result === 'boolean') return result
  if (typeof result === 'string') return result.length > 0
  if (typeof result === 'object' && result !== null) {
    const parsed = result as ResultTags & { success?: unknown; ok?: unknown; status?: unknown; id?: unknown }
    if (typeof parsed.success === 'boolean') return parsed.success
    if (typeof parsed.ok === 'boolean') return parsed.ok
    if (typeof parsed.status === 'string' && parsed.status.toLowerCase() === 'ok') return true
    if (parsed.id) return true
  }
  return true
}

export const resolveNativeSocialProviders = async (): Promise<string[]> => {
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return []
  const plugin = normalizePlugin(await loadNativePlugin<NativePlugin>('@capgo/capacitor-social-login'))
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
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return false
  const plugin = normalizePlugin(await loadNativePlugin<NativePlugin>('@capgo/capacitor-social-login'))
  if (!plugin) return false

  const payload = { provider }
  const normalizedProvider = provider.trim().toLowerCase()
  const variants = [
    [payload],
    [{ providerId: normalizedProvider }],
    [{ provider: normalizedProvider }],
    [normalizedProvider]
  ]

  const result = await callFirstSuccessful(
    plugin,
    ['signIn', 'signInWithProvider', 'login', 'authenticate', 'authenticateWithProvider', 'authorize'],
    variants
  )

  if (result !== undefined) return evaluateSocialResult(result)
  return false
}

export const savePasswordIfSupported = async (
  input: { username: string; password: string; website?: string; displayName?: string }
): Promise<boolean> => {
  if (!isNativeCapacitorRuntime() || typeof window === 'undefined') return false
  if (!input.username || !input.password) return false

  const plugin = normalizePlugin(await loadNativePlugin<NativePlugin>('@capgo/capacitor-autofill-save-password'))
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
  options?: { reason?: string; title?: string; fallbackTitle?: string }
): Promise<boolean> => {
  const plugin = await loadBiometricPlugin()
  if (!plugin) return false

  const optionsPayload = {
    reason: options?.reason ?? 'Authenticate to continue',
    title: options?.title,
    fallbackTitle: options?.fallbackTitle
  }
  const variants = [
    [optionsPayload],
    [optionsPayload.reason],
    [optionsPayload.reason, optionsPayload.title, optionsPayload.fallbackTitle],
    []
  ]
  const result = await callFirstSuccessful(
    plugin,
    ['authenticate', 'authenticateWithBiometrics', 'authorize', 'request', 'check', 'verify'],
    variants
  )

  return evaluateSocialResult(result)
}

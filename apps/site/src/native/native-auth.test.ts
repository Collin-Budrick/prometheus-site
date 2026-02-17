import { afterEach, describe, expect, it } from 'bun:test'
import {
  canUseNativeBiometricQuickLogin,
  clearNativeAuthCredentials,
  loadNativeAuthCredentials,
  requestNativeBiometricAuth,
  resetNativeAuthForTests,
  saveNativeAuthCredentials,
  setNativeAuthPluginLoaderOverrideForTests,
  setNativeAuthRuntimeOverrideForTests
} from './native-auth'

const CREDENTIAL_KEY = 'auth:native:credentials:v1'

type WindowStub = {
  location: {
    href: string
    origin: string
  }
}

const installWindow = () => {
  const windowStub: WindowStub = {
    location: {
      href: 'https://prometheus.dev/login',
      origin: 'https://prometheus.dev'
    }
  }
  ;(globalThis as unknown as { window?: unknown }).window = windowStub
}

const installSecureStoragePlugin = (storage: Map<string, string>, state?: { removeCalls: number }) => ({
  SecureStorage: {
    set: async (options: { key?: string; value?: string } | string, value?: string) => {
      const key = typeof options === 'string' ? options : options.key
      const resolvedValue = typeof options === 'string' ? value : options.value
      if (!key || typeof resolvedValue !== 'string') return false
      storage.set(key, resolvedValue)
      return true
    },
    get: async (options: { key?: string } | string) => {
      const key = typeof options === 'string' ? options : options.key
      if (!key) return { value: null }
      return { value: storage.get(key) ?? null }
    },
    remove: async (options: { key?: string } | string) => {
      const key = typeof options === 'string' ? options : options.key
      if (!key) return false
      if (state) state.removeCalls += 1
      storage.delete(key)
      return true
    }
  }
})

afterEach(() => {
  resetNativeAuthForTests()
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('native-auth credential vault', () => {
  it('supports save/get/clear round trip in native runtime', async () => {
    installWindow()
    const storage = new Map<string, string>()
    setNativeAuthRuntimeOverrideForTests(true)
    setNativeAuthPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@aparajita/capacitor-secure-storage') return installSecureStoragePlugin(storage)
      return null
    })

    const saved = await saveNativeAuthCredentials({
      username: 'pilot@prometheus.dev',
      password: 'vault-pass',
      website: 'https://prometheus.dev'
    })
    expect(saved).toBe(true)

    const loaded = await loadNativeAuthCredentials()
    expect(loaded).toEqual({
      username: 'pilot@prometheus.dev',
      password: 'vault-pass',
      website: 'https://prometheus.dev'
    })

    const cleared = await clearNativeAuthCredentials()
    expect(cleared).toBe(true)
    expect(await loadNativeAuthCredentials()).toBeNull()
  })

  it('clears invalid JSON payloads and returns null', async () => {
    installWindow()
    const storage = new Map<string, string>([[CREDENTIAL_KEY, '{invalid-json']])
    const state = { removeCalls: 0 }

    setNativeAuthRuntimeOverrideForTests(true)
    setNativeAuthPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@aparajita/capacitor-secure-storage') {
        return installSecureStoragePlugin(storage, state)
      }
      return null
    })

    const loaded = await loadNativeAuthCredentials()
    expect(loaded).toBeNull()
    expect(state.removeCalls).toBe(1)
    expect(storage.has(CREDENTIAL_KEY)).toBe(false)
  })

  it('returns safe fallbacks when native runtime is unavailable', async () => {
    installWindow()
    setNativeAuthRuntimeOverrideForTests(false)
    setNativeAuthPluginLoaderOverrideForTests(async () => {
      throw new Error('plugin loader should not run')
    })

    expect(await saveNativeAuthCredentials({ username: 'a', password: 'b' })).toBe(false)
    expect(await loadNativeAuthCredentials()).toBeNull()
    expect(await clearNativeAuthCredentials()).toBe(false)
    expect(await canUseNativeBiometricQuickLogin()).toBe(false)
  })
})

describe('native-auth biometric behavior', () => {
  it('reports biometric quick login availability when biometry and credentials are present', async () => {
    installWindow()
    const storage = new Map<string, string>([
      [
        CREDENTIAL_KEY,
        JSON.stringify({
          username: 'pilot@prometheus.dev',
          password: 'vault-pass',
          website: 'https://prometheus.dev',
          updatedAt: Date.now()
        })
      ]
    ])

    setNativeAuthRuntimeOverrideForTests(true)
    setNativeAuthPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@aparajita/capacitor-secure-storage') return installSecureStoragePlugin(storage)
      if (moduleId === '@aparajita/capacitor-biometric-auth') {
        return {
          BiometricAuth: {
            checkBiometry: async () => ({ isAvailable: true }),
            authenticate: async () => ({ success: true })
          }
        }
      }
      return null
    })

    expect(await canUseNativeBiometricQuickLogin()).toBe(true)
  })

  it('passes allowDeviceCredential through to biometric authenticate', async () => {
    installWindow()
    let capturedPayload: Record<string, unknown> = {}
    let captured = false

    setNativeAuthRuntimeOverrideForTests(true)
    setNativeAuthPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId !== '@aparajita/capacitor-biometric-auth') return null
      return {
        BiometricAuth: {
          authenticate: async (payload: Record<string, unknown>) => {
            captured = true
            capturedPayload = payload
            return { success: true }
          }
        }
      }
    })

    const success = await requestNativeBiometricAuth({
      reason: 'Authenticate to sign in',
      allowDeviceCredential: true
    })

    expect(success).toBe(true)
    expect(captured).toBe(true)
    expect(capturedPayload.allowDeviceCredential).toBe(true)
    expect(capturedPayload.deviceCredentialAllowed).toBe(true)
  })
})

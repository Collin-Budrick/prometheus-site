import { Preferences } from '@capacitor/preferences'
import { isNativeCapacitorRuntime } from './runtime'

export type PreferenceKey =
  | 'theme'
  | 'locale'
  | 'haptics-enabled'
  | 'onboarding-complete'
  | 'last-tab'

type PreferenceSchema = {
  'theme': 'light' | 'dark'
  'locale': string
  'haptics-enabled': '1' | '0'
  'onboarding-complete': '1' | '0'
  'last-tab': string
}

const STORAGE_PREFIX = 'prometheus:pref:'
const MIGRATION_GUARD_KEY = `${STORAGE_PREFIX}migration:v1`

const LEGACY_STORAGE_KEYS: Record<PreferenceKey, string> = {
  theme: 'prometheus-theme',
  locale: 'prometheus-lang',
  'haptics-enabled': 'prometheus-haptics-enabled',
  'onboarding-complete': 'prometheus-onboarding-complete',
  'last-tab': 'prometheus-last-tab'
}

const DEFAULTS: PreferenceSchema = {
  theme: 'light',
  locale: 'en',
  'haptics-enabled': '1',
  'onboarding-complete': '0',
  'last-tab': 'home'
}

const resolveStorageKey = (key: PreferenceKey) => `${STORAGE_PREFIX}${key}`

const readWebStorageValue = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeWebStorageValue = (key: string, value: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore localStorage errors in private mode.
  }
}

export const preferenceDefaults = DEFAULTS
export const preferenceAllowedKeys = Object.keys(DEFAULTS) as PreferenceKey[]

export const getPreference = async <K extends PreferenceKey>(key: K): Promise<PreferenceSchema[K] | null> => {
  const storageKey = resolveStorageKey(key)
  if (isNativeCapacitorRuntime()) {
    const result = await Preferences.get({ key: storageKey })
    return (result.value as PreferenceSchema[K] | null) ?? null
  }
  return (readWebStorageValue(storageKey) as PreferenceSchema[K] | null) ?? null
}

export const setPreference = async <K extends PreferenceKey>(key: K, value: PreferenceSchema[K]) => {
  const storageKey = resolveStorageKey(key)
  if (isNativeCapacitorRuntime()) {
    await Preferences.set({ key: storageKey, value })
    return
  }
  writeWebStorageValue(storageKey, value)
}

export const getPreferenceOrDefault = async <K extends PreferenceKey>(key: K): Promise<PreferenceSchema[K]> => {
  const value = await getPreference(key)
  return (value ?? DEFAULTS[key]) as PreferenceSchema[K]
}

const isMigrationComplete = async () => {
  if (isNativeCapacitorRuntime()) {
    const result = await Preferences.get({ key: MIGRATION_GUARD_KEY })
    return result.value === '1'
  }
  return readWebStorageValue(MIGRATION_GUARD_KEY) === '1'
}

const setMigrationComplete = async () => {
  if (isNativeCapacitorRuntime()) {
    await Preferences.set({ key: MIGRATION_GUARD_KEY, value: '1' })
    return
  }
  writeWebStorageValue(MIGRATION_GUARD_KEY, '1')
}

const readLegacyValue = (key: PreferenceKey) => readWebStorageValue(LEGACY_STORAGE_KEYS[key])

const copyLegacyKeys = async () => {
  for (const key of preferenceAllowedKeys) {
    const existing = await getPreference(key)
    if (existing !== null) continue
    const legacy = readLegacyValue(key)
    if (legacy !== null) {
      await setPreference(key, legacy as PreferenceSchema[typeof key])
      continue
    }

    if (key === 'locale') {
      continue
    }

    await setPreference(key, DEFAULTS[key])
    if (!isNativeCapacitorRuntime()) {
      writeWebStorageValue(LEGACY_STORAGE_KEYS[key], DEFAULTS[key])
    }
    if (key === 'theme' || key === 'locale') {
      writeWebStorageValue(LEGACY_STORAGE_KEYS[key], DEFAULTS[key])
    }
    if (key === 'theme' && typeof document !== 'undefined') {
      document.cookie = `prometheus-theme=${encodeURIComponent(DEFAULTS.theme)}; path=/; max-age=31536000; samesite=lax`
    }
    if (key === 'locale' && typeof document !== 'undefined') {
      document.cookie = `prometheus-lang=${encodeURIComponent(DEFAULTS.locale)}; path=/; max-age=31536000; samesite=lax`
    }
  }
}

export const migratePreferencesFromLegacy = async () => {
  if (await isMigrationComplete()) return false
  await copyLegacyKeys()
  await setMigrationComplete()
  return true
}

export type { PreferenceSchema }

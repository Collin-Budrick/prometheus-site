import { afterEach, describe, expect, it } from 'bun:test'
import { getPreference, getPreferenceOrDefault, migratePreferencesFromLegacy, preferenceDefaults, setPreference } from './preferences'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  clear() {
    this.map.clear()
  }
}

const storage = new MemoryStorage()

const installWindow = () => {
  ;(globalThis as unknown as { window?: unknown }).window = {
    localStorage: storage,
    matchMedia: () => ({ matches: false })
  }
}

afterEach(() => {
  storage.clear()
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('native preferences migration', () => {
  it('migrates legacy keys and keeps migration idempotent', async () => {
    installWindow()
    storage.setItem('prometheus-theme', 'dark')
    storage.setItem('prometheus-lang', 'ja')

    const firstRun = await migratePreferencesFromLegacy()
    const secondRun = await migratePreferencesFromLegacy()

    expect(firstRun).toBe(true)
    expect(secondRun).toBe(false)
    expect(await getPreference('theme')).toBe('dark')
    expect(await getPreference('locale')).toBe('ja')
  })

  it('falls back to defaults for missing values', async () => {
    installWindow()
    await migratePreferencesFromLegacy()

    expect(await getPreferenceOrDefault('haptics-enabled')).toBe(preferenceDefaults['haptics-enabled'])
    expect(await getPreferenceOrDefault('onboarding-complete')).toBe(preferenceDefaults['onboarding-complete'])
    expect(await getPreferenceOrDefault('last-tab')).toBe(preferenceDefaults['last-tab'])
  })

  it('writes and reads typed values', async () => {
    installWindow()
    await setPreference('last-tab', 'store')
    expect(await getPreference('last-tab')).toBe('store')
  })
})

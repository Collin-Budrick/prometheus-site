import { afterEach, describe, expect, it } from 'bun:test'
import {
  checkNativeUpdate,
  initializeNativeShortcuts,
  openExternalUrl,
  requestNativeReview,
  resetNativeAppExtrasForTests,
  setNativeAppExtrasPlatformOverrideForTests,
  setNativeAppExtrasPluginLoaderOverrideForTests,
  setNativeAppExtrasRuntimeOverrideForTests,
  setNativeAppExtrasTelemetryOverrideForTests
} from './native-app-extras'

type TestWindow = EventTarget & {
  location: {
    href: string
    origin: string
    protocol: string
    pathname: string
    search: string
    hash: string
  }
  navigator: { userAgent: string }
  matchMedia: (query: string) => { matches: boolean }
  open: (url: string, target?: string, features?: string) => unknown
}

const installWindow = () => {
  const target = new EventTarget() as TestWindow
  target.location = {
    href: 'https://prometheus.dev/',
    origin: 'https://prometheus.dev',
    protocol: 'https:',
    pathname: '/',
    search: '',
    hash: ''
  }
  target.navigator = { userAgent: 'Mozilla/5.0 tauri desktop' }
  target.matchMedia = () => ({ matches: false })
  target.open = () => null
  ;(globalThis as unknown as { window?: unknown }).window = target
  ;(globalThis as unknown as { navigator?: unknown }).navigator = target.navigator
  return target
}

afterEach(() => {
  resetNativeAppExtrasForTests()
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
})

describe('native app extras bridge', () => {
  it('opens URLs through shell plugin in native runtime', async () => {
    installWindow()
    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@tauri-apps/plugin-shell') {
        return {
          open: async () => {}
        }
      }
      return null
    })

    const result = await openExternalUrl('https://example.com')
    expect(result).toEqual({ attempted: true, handled: true })
  })

  it('registers desktop shortcuts through global shortcut plugin', async () => {
    installWindow()
    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('desktop')

    const shortcuts: string[] = []
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@tauri-apps/plugin-global-shortcut') {
        return {
          register: async (shortcut: string) => {
            shortcuts.push(shortcut)
          }
        }
      }
      return null
    })

    const initialized = await initializeNativeShortcuts()
    expect(initialized).toBe(true)
    expect(shortcuts).toContain('CommandOrControl+,')
    expect(shortcuts).toContain('CommandOrControl+Shift+U')
  })

  it('falls back for review flow when runtime is disabled', async () => {
    installWindow()
    setNativeAppExtrasRuntimeOverrideForTests(false)
    const telemetry: Array<{ feature: string; status: string }> = []
    setNativeAppExtrasTelemetryOverrideForTests((feature, status) => {
      telemetry.push({ feature, status })
    })

    const requested = await requestNativeReview()
    expect(requested).toBe(false)
    expect(telemetry.some((entry) => entry.feature === 'native-review' && entry.status === 'fallback')).toBe(true)
  })

  it('installs available updates via updater plugin on desktop', async () => {
    installWindow()
    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('desktop')

    let installed = false
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@tauri-apps/plugin-updater') {
        return {
          check: async () => ({
            available: true,
            downloadAndInstall: async () => {
              installed = true
            }
          })
        }
      }
      return null
    })

    const result = await checkNativeUpdate()
    expect(result).toBe(true)
    expect(installed).toBe(true)
  })
})

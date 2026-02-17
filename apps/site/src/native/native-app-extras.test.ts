import { afterEach, describe, expect, it } from 'bun:test'
import {
  checkNativeUpdate,
  initializeNativeAutomaticAppActions,
  resetNativeAppExtrasForTests,
  runNativeAutomaticAppActionsOnResume,
  setNativeAppExtrasPlatformOverrideForTests,
  setNativeAppExtrasPluginLoaderOverrideForTests,
  setNativeAppExtrasRuntimeOverrideForTests,
  setNativeAppExtrasTelemetryOverrideForTests
} from './native-app-extras'

type StorageStub = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

type WindowStub = EventTarget & {
  location: {
    href: string
    origin: string
  }
  localStorage: StorageStub
  open: (url: string, target?: string, features?: string) => void
  Capacitor?: {
    getPlatform?: () => string
  }
}

const REVIEW_FIRST_SEEN_KEY = 'prometheus:native-review:first-seen-at'
const REVIEW_LAUNCH_COUNT_KEY = 'prometheus:native-review:launch-count'
const REVIEW_LAST_ATTEMPT_KEY = 'prometheus:native-review:last-attempt-at'
const DAY_MS = 24 * 60 * 60 * 1000

const installWindow = () => {
  const target = new EventTarget() as WindowStub
  const memory = new Map<string, string>()
  target.location = {
    href: 'https://prometheus.dev/settings',
    origin: 'https://prometheus.dev'
  }
  target.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key, value) => {
      memory.set(key, value)
    },
    removeItem: (key) => {
      memory.delete(key)
    }
  }
  target.open = () => {
    // no-op
  }
  target.Capacitor = {
    getPlatform: () => 'android'
  }
  ;(globalThis as unknown as { window?: unknown }).window = target
  return { window: target, memory }
}

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  resetNativeAppExtrasForTests()
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
})

describe('native app extras automation', () => {
  it('no-ops safely when native runtime is not available', async () => {
    installWindow()
    let loadCount = 0
    setNativeAppExtrasRuntimeOverrideForTests(false)
    setNativeAppExtrasPluginLoaderOverrideForTests(async () => {
      loadCount += 1
      return null
    })

    await initializeNativeAutomaticAppActions()
    await runNativeAutomaticAppActionsOnResume()

    expect(loadCount).toBe(0)
  })

  it('does not request review when cadence is not eligible', async () => {
    const { window } = installWindow()
    let reviewCalls = 0
    let updateChecks = 0

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@capacitor-community/in-app-review') {
        return {
          InAppReview: {
            requestReview: async () => {
              reviewCalls += 1
            }
          }
        }
      }
      if (moduleId === '@capawesome/capacitor-app-update') {
        return {
          AppUpdate: {
            getAppUpdateInfo: async () => {
              updateChecks += 1
              return { updateAvailability: 1 }
            },
            openAppStore: async () => {
              // no-op
            }
          }
        }
      }
      return null
    })

    await initializeNativeAutomaticAppActions()
    window.dispatchEvent(new Event('pointerdown'))
    await flushAsync()

    expect(reviewCalls).toBe(0)
    expect(updateChecks).toBe(1)
    expect(window.localStorage.getItem(REVIEW_LAUNCH_COUNT_KEY)).toBe('1')
  })

  it('requests review once after intent when cadence becomes eligible and stores attempt timestamp', async () => {
    const { window } = installWindow()
    const now = Date.now()
    window.localStorage.setItem(REVIEW_FIRST_SEEN_KEY, String(now - 8 * DAY_MS))
    window.localStorage.setItem(REVIEW_LAUNCH_COUNT_KEY, '4')

    let reviewCalls = 0

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId === '@capacitor-community/in-app-review') {
        return {
          InAppReview: {
            requestReview: async () => {
              reviewCalls += 1
            }
          }
        }
      }
      if (moduleId === '@capawesome/capacitor-app-update') {
        return {
          AppUpdate: {
            getAppUpdateInfo: async () => ({ updateAvailability: 1 }),
            openAppStore: async () => {
              // no-op
            }
          }
        }
      }
      return null
    })

    await initializeNativeAutomaticAppActions()
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('keydown'))
    await flushAsync()

    expect(reviewCalls).toBe(1)
    const attemptRaw = window.localStorage.getItem(REVIEW_LAST_ATTEMPT_KEY)
    expect(attemptRaw).not.toBeNull()
    expect(Number(attemptRaw)).toBeGreaterThan(0)
  })

  it('throttles automatic update checks between startup and resume', async () => {
    installWindow()
    let getInfoCalls = 0

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId !== '@capawesome/capacitor-app-update') return null
      return {
        AppUpdate: {
          getAppUpdateInfo: async () => {
            getInfoCalls += 1
            return { updateAvailability: 1 }
          },
          openAppStore: async () => {
            // no-op
          }
        }
      }
    })

    await initializeNativeAutomaticAppActions()
    await runNativeAutomaticAppActionsOnResume()

    expect(getInfoCalls).toBe(1)
  })

  it('performs immediate update on Android when allowed', async () => {
    installWindow()
    let immediateCalls = 0
    let storeCalls = 0

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId !== '@capawesome/capacitor-app-update') return null
      return {
        AppUpdate: {
          getAppUpdateInfo: async () => ({ updateAvailability: 2, immediateUpdateAllowed: true }),
          performImmediateUpdate: async () => {
            immediateCalls += 1
            return { code: 0 }
          },
          openAppStore: async () => {
            storeCalls += 1
          }
        }
      }
    })

    const result = await checkNativeUpdate()
    expect(result).toBe(true)
    expect(immediateCalls).toBe(1)
    expect(storeCalls).toBe(0)
  })

  it('falls back to app store when immediate update is not allowed', async () => {
    installWindow()
    let storeCalls = 0

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId !== '@capawesome/capacitor-app-update') return null
      return {
        AppUpdate: {
          getAppUpdateInfo: async () => ({ updateAvailability: 2, immediateUpdateAllowed: false }),
          openAppStore: async () => {
            storeCalls += 1
          }
        }
      }
    })

    const result = await checkNativeUpdate()
    expect(result).toBe(true)
    expect(storeCalls).toBe(1)
  })

  it('returns success for no-update checks without triggering store/update actions', async () => {
    installWindow()
    let immediateCalls = 0
    let storeCalls = 0

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId !== '@capawesome/capacitor-app-update') return null
      return {
        AppUpdate: {
          getAppUpdateInfo: async () => ({ updateAvailability: 1, immediateUpdateAllowed: false }),
          performImmediateUpdate: async () => {
            immediateCalls += 1
            return { code: 0 }
          },
          openAppStore: async () => {
            storeCalls += 1
          }
        }
      }
    })

    const result = await checkNativeUpdate()
    expect(result).toBe(true)
    expect(immediateCalls).toBe(0)
    expect(storeCalls).toBe(0)
  })

  it('emits error telemetry when update checks fail', async () => {
    installWindow()

    const events: Array<{
      feature: string
      status: 'success' | 'fallback' | 'error'
      detail?: Record<string, string>
    }> = []

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasTelemetryOverrideForTests((feature, status, options) => {
      events.push({ feature, status, detail: options?.detail })
    })
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId !== '@capawesome/capacitor-app-update') return null
      return {
        AppUpdate: {
          getAppUpdateInfo: async () => {
            throw new Error('broken')
          },
          openAppStore: async () => {
            // no-op
          }
        }
      }
    })

    const result = await checkNativeUpdate()
    expect(result).toBe(false)

    const updateError = events.find((event) => event.feature === 'native-update-check' && event.status === 'error')
    expect(updateError).toBeDefined()
    expect(updateError?.detail?.outcome).toBe('error')
  })

  it('deduplicates concurrent update checks with an in-module lock', async () => {
    installWindow()
    let getInfoCalls = 0

    setNativeAppExtrasRuntimeOverrideForTests(true)
    setNativeAppExtrasPlatformOverrideForTests('android')
    setNativeAppExtrasPluginLoaderOverrideForTests(async (moduleId) => {
      if (moduleId !== '@capawesome/capacitor-app-update') return null
      return {
        AppUpdate: {
          getAppUpdateInfo: async () => {
            getInfoCalls += 1
            await new Promise((resolve) => setTimeout(resolve, 10))
            return { updateAvailability: 1 }
          },
          openAppStore: async () => {
            // no-op
          }
        }
      }
    })

    const [first, second] = await Promise.all([checkNativeUpdate(), checkNativeUpdate()])
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(getInfoCalls).toBe(1)
  })
})

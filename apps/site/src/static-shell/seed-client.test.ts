import { afterEach, describe, expect, it } from 'bun:test'
import { STATIC_SHELL_SEED_SCRIPT_ID } from './constants'
import {
  readStaticShellSeed,
  resetStaticShellSeedCacheForTests,
  writeStaticShellSeed
} from './seed-client'

type ScriptRecord = {
  textContent: string | null
}

const originalDocument = (globalThis as typeof globalThis & { document?: unknown }).document
const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window
const setGlobalValue = (key: 'document' | 'window', value: unknown) => {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true
  })
}

const installSeedEnvironment = (payload: unknown, options: { throwOnWrite?: boolean } = {}) => {
  let text: string | null = JSON.stringify(payload)
  const scripts = new Map<string, ScriptRecord>([
    [
      STATIC_SHELL_SEED_SCRIPT_ID,
      Object.defineProperty(
        {},
        'textContent',
        options.throwOnWrite
          ? {
              configurable: true,
              get: () => text,
              set: () => {
                throw new TypeError("This document requires 'TrustedScript' assignment.")
              }
            }
          : {
              configurable: true,
              get: () => text,
              set: (value: string | null) => {
                text = value
              }
            }
      ) as ScriptRecord
    ]
  ])

  const documentStub = {
    getElementById: (id: string) => scripts.get(id) ?? null
  }
  const windowStub = {}

  setGlobalValue('document', documentStub)
  setGlobalValue('window', windowStub)

  return {
    documentStub,
    windowStub,
    removeScript: () => {
      scripts.delete(STATIC_SHELL_SEED_SCRIPT_ID)
    },
    readText: () => text
  }
}

afterEach(() => {
  resetStaticShellSeedCacheForTests()
  setGlobalValue('document', originalDocument)
  setGlobalValue('window', originalWindow)
})

describe('static shell seed client', () => {
  it('updates the in-memory seed without mutating the DOM script text', () => {
    const installed = installSeedEnvironment(
      {
        lang: 'en',
        currentPath: '/',
        languageSeed: {
          ui: {
            navHome: 'Home'
          }
        },
        bootstrapMode: 'home-static',
        authPolicy: 'public',
        isAuthenticated: false,
        snapshotKey: '/'
      },
      { throwOnWrite: true }
    )

    expect(readStaticShellSeed()?.lang).toBe('en')

    const next = writeStaticShellSeed({
      lang: 'ja',
      currentPath: '/store',
      snapshotKey: '/store',
      languageSeed: {
        ui: {
          navStore: 'ストア'
        }
      }
    })

    expect(next?.lang).toBe('ja')
    expect(next?.currentPath).toBe('/store')
    expect(next?.languageSeed.ui?.navStore).toBe('ストア')
    expect(installed.readText()).toContain('"lang":"en"')
    expect(readStaticShellSeed()?.lang).toBe('ja')
    expect(readStaticShellSeed()?.languageSeed.ui?.navStore).toBe('ストア')
  })

  it('reuses the cached seed after the bootstrap script is removed', () => {
    const installed = installSeedEnvironment({
      lang: 'ko',
      currentPath: '/lab',
      languageSeed: {
        ui: {
          navLab: '랩'
        }
      },
      bootstrapMode: 'fragment-static',
      authPolicy: 'public',
      isAuthenticated: false,
      snapshotKey: '/lab'
    })

    expect(readStaticShellSeed()?.lang).toBe('ko')
    installed.removeScript()

    const cached = readStaticShellSeed()
    expect(cached?.lang).toBe('ko')
    expect(cached?.currentPath).toBe('/lab')
    expect(cached?.languageSeed.ui?.navLab).toBe('랩')
  })
})

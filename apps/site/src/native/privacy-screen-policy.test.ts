import { afterEach, describe, expect, it } from 'bun:test'
import {
  applyPrivacyScreenPolicy,
  getPrivacyScreenAlwaysOn,
  setPrivacyScreenAlwaysOn,
  setSensitivePrivacyView
} from './privacy-screen-policy'

type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type TestWindow = EventTarget & {
  location: { pathname: string }
  localStorage: StorageLike
}

const installWindow = (pathname = '/settings') => {
  const memory = new Map<string, string>()
  const target = new EventTarget() as TestWindow
  target.location = { pathname }
  target.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key, value) => {
      memory.set(key, value)
    }
  }
  ;(globalThis as unknown as { window?: unknown }).window = target
  ;(globalThis as unknown as { document?: unknown }).document = {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {}
  }
  return target
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { document?: unknown }).document
})

describe('privacy screen policy', () => {
  it('persists always-on preference', async () => {
    installWindow('/chat')
    expect(getPrivacyScreenAlwaysOn()).toBe(false)

    await setPrivacyScreenAlwaysOn(true)
    expect(getPrivacyScreenAlwaysOn()).toBe(true)
  })

  it('applies policy without throwing on sensitive route', async () => {
    installWindow('/settings')
    await setSensitivePrivacyView(true)
    await applyPrivacyScreenPolicy('test')
    await setSensitivePrivacyView(false)
  })
})

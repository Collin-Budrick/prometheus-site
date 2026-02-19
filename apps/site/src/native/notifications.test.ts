import { afterEach, describe, expect, it } from 'bun:test'
import { handleNativeNotificationOpen, requestNativeNotificationPermission } from './notifications'

type TestWindow = EventTarget & {
  location: {
    href: string
    origin: string
    protocol: string
    pathname: string
    search: string
    hash: string
  }
  navigator: {
    userAgent: string
  }
  history: {
    pushState: (_state: unknown, _title: string, path: string) => void
  }
  matchMedia: (query: string) => { matches: boolean }
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
  target.navigator = { userAgent: 'Mozilla/5.0' }
  target.matchMedia = () => ({ matches: false })
  target.history = {
    pushState: (_state, _title, path) => {
      const next = new URL(path, target.location.origin)
      target.location.pathname = next.pathname
      target.location.search = next.search
      target.location.hash = next.hash
      target.location.href = next.toString()
    }
  }
  ;(globalThis as unknown as { window?: unknown }).window = target
  ;(globalThis as unknown as { navigator?: unknown }).navigator = target.navigator
  return target
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
  delete (globalThis as unknown as { Notification?: unknown }).Notification
  delete (globalThis as unknown as { performance?: unknown }).performance
  delete (globalThis as unknown as { PopStateEvent?: unknown }).PopStateEvent
})

describe('native notifications', () => {
  it('uses browser Notification permission flow outside native runtime', async () => {
    installWindow()
    ;(globalThis as unknown as { Notification: { permission: string; requestPermission: () => Promise<string> } }).Notification = {
      permission: 'default',
      requestPermission: async () => 'granted'
    }

    const granted = await requestNativeNotificationPermission()
    expect(granted).toBe(true)
  })

  it('returns false when browser permission is denied', async () => {
    installWindow()
    ;(globalThis as unknown as { Notification: { permission: string; requestPermission: () => Promise<string> } }).Notification = {
      permission: 'default',
      requestPermission: async () => 'denied'
    }

    const granted = await requestNativeNotificationPermission()
    expect(granted).toBe(false)
  })

  it('routes native notification payload URLs through deep-link navigation', () => {
    const win = installWindow()
    ;(globalThis as unknown as { performance: { now: () => number } }).performance = { now: () => 1 }
    ;(globalThis as unknown as { PopStateEvent: typeof Event }).PopStateEvent = Event

    const handled = handleNativeNotificationOpen({ url: 'prometheus://open/chat?thread=1' })
    expect(handled).toBe(true)
    expect(win.location.pathname).toBe('/chat')
  })
})

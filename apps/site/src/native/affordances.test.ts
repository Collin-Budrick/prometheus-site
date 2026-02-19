import { afterEach, describe, expect, it } from 'bun:test'
import { confirmNativeDialog, shareNativeContent, showNativeActionSheet, showNativeAlert } from './affordances'

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
  matchMedia: (query: string) => { matches: boolean }
  alert: (message: string) => void
  confirm: (message: string) => boolean
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
  target.alert = () => {}
  target.confirm = () => true
  ;(globalThis as unknown as { window?: unknown }).window = target
  ;(globalThis as unknown as { navigator?: unknown }).navigator = target.navigator
  return target
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
})

describe('native affordances fallbacks', () => {
  it('uses browser alert fallback outside native runtime', async () => {
    const win = installWindow()
    let captured = ''
    win.alert = (value) => {
      captured = value
    }

    const result = await showNativeAlert('Heads up', 'Fallback alert')
    expect(result).toBe(true)
    expect(captured).toContain('Fallback alert')
  })

  it('uses browser confirm fallback outside native runtime', async () => {
    const win = installWindow()
    win.confirm = () => false
    const result = await confirmNativeDialog('Delete', 'Remove this message?')
    expect(result).toBe(false)
  })

  it('uses navigator.share when available', async () => {
    installWindow()
    let shared = false
    ;(globalThis as unknown as { navigator: { share?: (value: { url?: string }) => Promise<void> } }).navigator = {
      share: async () => {
        shared = true
      }
    }

    const result = await shareNativeContent({ url: 'https://prometheus.dev/chat' })
    expect(result).toBe(true)
    expect(shared).toBe(true)
  })

  it('returns null action sheet selection outside native runtime', async () => {
    installWindow()
    const result = await showNativeActionSheet('Options', [{ title: 'Open' }, { title: 'Cancel', style: 'cancel' }])
    expect(result).toBeNull()
  })
})

import { afterEach, describe, expect, it } from 'bun:test'
import { connectivityState, initConnectivityStore, resetConnectivityForTests } from './connectivity'

type WindowStub = EventTarget & {
  localStorage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }
  matchMedia: (query: string) => { matches: boolean }
}

const installWindow = () => {
  const target = new EventTarget() as WindowStub
  const memory = new Map<string, string>()
  target.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key, value) => {
      memory.set(key, value)
    }
  }
  target.matchMedia = () => ({ matches: false })
  ;(globalThis as unknown as { window?: unknown }).window = target
  return target
}

afterEach(async () => {
  await resetConnectivityForTests()
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
})

describe('connectivity state', () => {
  it('tracks offline -> online transitions via browser events', async () => {
    const win = installWindow()
    ;(globalThis as unknown as { navigator?: unknown }).navigator = { onLine: true }

    await initConnectivityStore()
    expect(connectivityState.value.online).toBe(true)

    win.dispatchEvent(new Event('offline'))
    expect(connectivityState.value.online).toBe(false)
    expect(connectivityState.value.source).toBe('event')

    win.dispatchEvent(new Event('online'))
    expect(connectivityState.value.online).toBe(true)
    expect(connectivityState.value.source).toBe('event')
  })
})

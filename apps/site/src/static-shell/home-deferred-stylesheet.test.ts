import { afterEach, describe, expect, it } from 'bun:test'
import { ensureStaticHomeDeferredStylesheet } from './home-deferred-stylesheet'
import { resetHomeDemoRuntimeLoaderForTests } from './home-demo-runtime-loader'
import {
  STATIC_HOME_DATA_SCRIPT_ID,
  STATIC_SHELL_SEED_SCRIPT_ID
} from './constants'

class MockScriptElement {
  constructor(readonly textContent: string) {}
}

class MockLinkElement {
  rel = 'stylesheet'
  sheet: unknown = null
  private attrs = new Map<string, string>()
  private listeners = new Map<string, Array<() => void>>()

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
    if (name === 'rel') {
      this.rel = value
    }
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      listeners.filter((value) => value !== listener)
    )
  }

  emit(type: string) {
    ;(this.listeners.get(type) ?? []).slice().forEach((listener) => listener())
  }
}

afterEach(() => {
  resetHomeDemoRuntimeLoaderForTests()
})

describe('ensureStaticHomeDeferredStylesheet', () => {
  it('reuses the shared deferred stylesheet link across repeated home loads', async () => {
    resetHomeDemoRuntimeLoaderForTests()
    const link = new MockLinkElement()
    let appendCount = 0
    const scripts = new Map([
      [
        STATIC_SHELL_SEED_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            currentPath: '/',
            snapshotKey: '/',
            isAuthenticated: false,
            lang: 'en',
            languageSeed: {}
          })
        )
      ],
      [
        STATIC_HOME_DATA_SCRIPT_ID,
        new MockScriptElement(
          JSON.stringify({
            path: '/',
            lang: 'en',
            fragmentOrder: [],
            fragmentVersions: {},
            languageSeed: {},
            homeDemoStylesheetHref: 'https://prometheus.prod/assets/home-static-deferred.css'
          })
        )
      ]
    ])
    const doc = {
      getElementById: (id: string) => scripts.get(id) ?? null,
      head: {
        appendChild: () => {
          appendCount += 1
          return link
        }
      },
      createElement: () => link,
      querySelector: () => null
    }

    const firstLoad = ensureStaticHomeDeferredStylesheet({ doc: doc as never })
    const secondLoad = ensureStaticHomeDeferredStylesheet({ doc: doc as never })

    expect(firstLoad).toBe(secondLoad)
    expect(link.getAttribute('data-home-demo-stylesheet')).toBe('true')
    expect(appendCount).toBe(1)

    link.emit('load')
    await firstLoad
    await secondLoad
  })
})

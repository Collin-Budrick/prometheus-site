import { describe, expect, it } from 'bun:test'

import {
  isStaticHomeShellMode,
  resolveFragmentShellMode,
  shouldHoldStaticHomeStartup
} from './fragment-shell-mode'

describe('fragment shell mode', () => {
  it('resolves the home route to static-home mode', () => {
    expect(resolveFragmentShellMode('/')).toBe('static-home')
    expect(resolveFragmentShellMode('/store')).toBe('interactive')
  })

  it('identifies static-home mode', () => {
    expect(isStaticHomeShellMode('static-home')).toBe(true)
    expect(isStaticHomeShellMode('interactive')).toBe(false)
  })

  it('holds static-home startup until the boot gate unlocks', () => {
    expect(
      shouldHoldStaticHomeStartup({
        shellMode: 'static-home',
        startupReady: false,
        langChanged: false
      })
    ).toBe(true)

    expect(
      shouldHoldStaticHomeStartup({
        shellMode: 'static-home',
        startupReady: true,
        langChanged: false
      })
    ).toBe(false)

    expect(
      shouldHoldStaticHomeStartup({
        shellMode: 'interactive',
        startupReady: false,
        langChanged: false
      })
    ).toBe(false)
  })
})

import { describe, expect, it } from 'bun:test'

import { shouldActivateDockMotion } from './dock-motion'

describe('shouldActivateDockMotion', () => {
  it('stays static without fine hover support', () => {
    expect(
      shouldActivateDockMotion({
        hoverMatches: false,
        pointerType: 'mouse'
      })
    ).toBe(false)
  })

  it('activates on fine-pointer hover intent', () => {
    expect(
      shouldActivateDockMotion({
        hoverMatches: true,
        pointerType: 'mouse'
      })
    ).toBe(true)
  })

  it('stays static for touch intent', () => {
    expect(
      shouldActivateDockMotion({
        hoverMatches: true,
        pointerType: 'touch'
      })
    ).toBe(false)
  })
})

describe('dock semantics', () => {
  it('keeps the shared dock wrapped in a nav landmark with list semantics', async () => {
    const dockBarSource = await Bun.file(new URL('./DockBar.tsx', import.meta.url)).text()
    const dockSource = await Bun.file(new URL('./Dock.tsx', import.meta.url)).text()

    expect(dockBarSource).toContain('<nav class="dock-nav" aria-label={ariaLabel}>')
    expect(dockSource).toContain('<ul ref={dockRef}')
    expect(dockSource).toContain('<li class={`dock-icon')
  })
})

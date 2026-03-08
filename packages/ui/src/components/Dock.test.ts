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

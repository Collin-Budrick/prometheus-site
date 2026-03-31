import { describe, expect, it } from 'bun:test'
import type { BentoSlot, FragmentPlanEntry } from './fragment-shell-types'
import {
  FULL_WIDTH_LAYOUT_COLUMN,
  FULL_WIDTH_SLOT_COLUMN,
  resolveEffectiveMainGridEntries,
  resolveEffectiveMainGridSlots
} from './fragment-shell-layout'

const createEntry = (id: string, column = 'span 6'): FragmentPlanEntry => ({
  id,
  critical: true,
  layout: {
    column
  }
})

const createSlots = (count: number): BentoSlot[] => {
  if (count === 2) {
    return [
      { id: 'slot-left-1', size: 'small', column: '1 / span 6', row: '1' },
      { id: 'slot-right-1', size: 'small', column: '7 / span 6', row: '1' }
    ]
  }
  return [
    { id: 'slot-left-1', size: 'small', column: '1 / span 6', row: '1' },
    { id: 'slot-left-2', size: 'small', column: '1 / span 6', row: '2' },
    { id: 'slot-right-1', size: 'small', column: '7 / span 6', row: '1' }
  ]
}

describe('fragment-shell-layout', () => {
  it('promotes the first main-grid card to full width on desktop when the card count is odd', () => {
    const entries = [createEntry('one'), createEntry('two'), createEntry('three')]
    const slots = createSlots(entries.length)

    const resolvedEntries = resolveEffectiveMainGridEntries(entries, 'desktop-two-column')
    const resolvedSlots = resolveEffectiveMainGridSlots({
      entries,
      slots,
      mode: 'desktop-two-column'
    })

    expect(resolvedEntries[0]?.layout.column).toBe(FULL_WIDTH_LAYOUT_COLUMN)
    expect(resolvedEntries.slice(1).map((entry) => entry.layout.column)).toEqual(['span 6', 'span 6'])
    expect(resolvedSlots[0]?.column).toBe(FULL_WIDTH_SLOT_COLUMN)
    expect(resolvedSlots.slice(1).map((slot) => slot.column)).toEqual(['1 / span 6', '7 / span 6'])
  })

  it('leaves an even card grid unchanged', () => {
    const entries = [createEntry('one'), createEntry('two')]
    const slots = createSlots(entries.length)

    const resolvedEntries = resolveEffectiveMainGridEntries(entries, 'desktop-two-column')
    const resolvedSlots = resolveEffectiveMainGridSlots({
      entries,
      slots,
      mode: 'desktop-two-column'
    })

    expect(resolvedEntries.map((entry) => entry.layout.column)).toEqual(['span 6', 'span 6'])
    expect(resolvedSlots.map((slot) => slot.column)).toEqual(['1 / span 6', '7 / span 6'])
  })

  it('preserves an explicitly full-width first card', () => {
    const entries = [createEntry('one', 'span 12'), createEntry('two')]
    const slots = createSlots(entries.length)

    const resolvedEntries = resolveEffectiveMainGridEntries(entries, 'desktop-two-column')
    const resolvedSlots = resolveEffectiveMainGridSlots({
      entries,
      slots,
      mode: 'desktop-two-column'
    })

    expect(resolvedEntries[0]?.layout.column).toBe('span 12')
    expect(resolvedEntries[1]?.layout.column).toBe('span 6')
    expect(resolvedSlots[0]?.column).toBe(FULL_WIDTH_SLOT_COLUMN)
    expect(resolvedSlots[1]?.column).toBe('7 / span 6')
  })

  it('does not apply the promotion in stacked mode', () => {
    const entries = [createEntry('one'), createEntry('two'), createEntry('three')]
    const slots = createSlots(entries.length)

    const resolvedEntries = resolveEffectiveMainGridEntries(entries, 'stacked')
    const resolvedSlots = resolveEffectiveMainGridSlots({
      entries,
      slots,
      mode: 'stacked'
    })

    expect(resolvedEntries.map((entry) => entry.layout.column)).toEqual(['span 6', 'span 6', 'span 6'])
    expect(resolvedSlots.map((slot) => slot.column)).toEqual(['1 / span 6', '1 / span 6', '7 / span 6'])
  })
})

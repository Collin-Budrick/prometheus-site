import { describe, expect, it } from 'bun:test'
import { storeFragments } from './store'

describe('store fragment layout', () => {
  it('renders the create card as a full-width desktop row', () => {
    const createEntry = storeFragments.find((entry) => entry.id.includes('/create@'))

    expect(createEntry?.layout?.column).toBe('span 12')
  })
})

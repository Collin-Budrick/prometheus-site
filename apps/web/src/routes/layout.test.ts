import { describe, expect, it } from 'bun:test'

import { resolveSpeculationRules } from './layout-helpers'

describe('speculation rules', () => {
  it('omits speculation rules when the API base is absent', () => {
    expect(resolveSpeculationRules({})).toBeNull()
  })

  it('prefetches relative API URLs when the base is relative', () => {
    const rules = resolveSpeculationRules({ VITE_API_BASE: '/api' })

    expect(rules?.prefetch[0].urls).toEqual([
      '/api/fragments/plan?path=/',
      '/api/fragments/stream?path=/'
    ])
  })

  it('prefetches absolute API URLs when the base is present', () => {
    const rules = resolveSpeculationRules({ VITE_API_BASE: 'https://api.example.com' })

    expect(rules?.prefetch[0].urls).toEqual([
      'https://api.example.com/fragments/plan?path=/',
      'https://api.example.com/fragments/stream?path=/'
    ])
  })
})

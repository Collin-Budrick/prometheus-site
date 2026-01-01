import { describe, expect, it } from 'bun:test'

import { resolveApiBase, resolveSpeculationRules } from './layout-helpers'

describe('resolveApiBase', () => {
  it('normalizes valid http origins and trims trailing slash', () => {
    expect(resolveApiBase({ VITE_API_BASE: ' https://api.example.com/root/ ' })).toBe(
      'https://api.example.com/root'
    )
  })

  it('rejects relative paths and unsupported protocols', () => {
    expect(resolveApiBase({ VITE_API_BASE: '/api' })).toBe('')
    expect(resolveApiBase({ VITE_API_BASE: 'ftp://api.example.com' })).toBe('')
    expect(resolveApiBase({ VITE_API_BASE: '' })).toBe('')
  })
})

describe('speculation rules', () => {
  it('omits speculation rules when the API base is absent', () => {
    expect(resolveSpeculationRules({})).toBeNull()
  })

  it('prefetches absolute API URLs when the base is present', () => {
    const rules = resolveSpeculationRules({ VITE_API_BASE: 'https://api.example.com' })

    expect(rules?.prefetch[0].urls).toEqual([
      'https://api.example.com/fragments/plan?path=/',
      'https://api.example.com/fragments/stream?path=/'
    ])
  })
})

import { afterEach, describe, expect, it } from 'bun:test'

import { getApiBase, normalizeApiBase } from './config'

const originalApiBase = process.env.API_BASE
const clearProcessApiBase = () => {
  delete process.env.API_BASE
}

afterEach(() => {
  if (typeof originalApiBase === 'undefined') {
    delete process.env.API_BASE
  } else {
    process.env.API_BASE = originalApiBase
  }
})

describe('getApiBase', () => {
  it('normalizes absolute URLs and trims trailing slashes', () => {
    clearProcessApiBase()
    expect(getApiBase({ VITE_API_BASE: ' https://api.example.com/root/ ' })).toBe(
      'https://api.example.com/root'
    )
  })

  it('supports relative paths for same-origin APIs', () => {
    clearProcessApiBase()
    expect(getApiBase({ VITE_API_BASE: '/api' })).toBe('/api')
    expect(normalizeApiBase('/api/')).toBe('/api')
  })

  it('omits localhost defaults in production when unset', () => {
    clearProcessApiBase()
    expect(getApiBase({ MODE: 'production' })).toBe('')
  })

  it('falls back to localhost in development', () => {
    clearProcessApiBase()
    expect(getApiBase({ DEV: true })).toBe('http://127.0.0.1:4000')
  })

  it('rejects unsupported protocols', () => {
    clearProcessApiBase()
    expect(getApiBase({ VITE_API_BASE: 'ftp://api.example.com' })).toBe('')
  })
})

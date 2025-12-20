import { describe, expect, it } from 'bun:test'
import { resolvePathnameLocale } from './pathname-locale'

describe('resolvePathnameLocale', () => {
  it('returns the first path segment when it is a supported locale', () => {
    expect(resolvePathnameLocale('/ko')).toBe('ko')
    expect(resolvePathnameLocale('/ko/')).toBe('ko')
    expect(resolvePathnameLocale('/en/chat')).toBe('en')
  })

  it('returns undefined when no locale prefix is present', () => {
    expect(resolvePathnameLocale('/')).toBeUndefined()
    expect(resolvePathnameLocale('/chat')).toBeUndefined()
  })
})


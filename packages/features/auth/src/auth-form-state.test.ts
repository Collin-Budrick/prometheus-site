import { describe, expect, it } from 'bun:test'

import {
  authEmailCookieKey,
  authNameCookieKey,
  authRememberCookieKey,
  readCookieValueRaw,
  resolveAuthFormState
} from './auth-form-state'

describe('resolveAuthFormState', () => {
  it('reads remembered auth form values from cookies', () => {
    const cookieHeader = [
      `${authEmailCookieKey}=test%40example.com`,
      `${authNameCookieKey}=Fragment%20Prime`,
      `${authRememberCookieKey}=1`
    ].join('; ')

    expect(resolveAuthFormState(cookieHeader)).toEqual({
      email: 'test@example.com',
      name: 'Fragment Prime',
      remember: true
    })
  })

  it('returns empty defaults when cookies are missing or malformed', () => {
    expect(resolveAuthFormState('')).toEqual({
      email: '',
      name: '',
      remember: false
    })
    expect(resolveAuthFormState(`${authEmailCookieKey}=%E0%A4%A`)).toEqual({
      email: '',
      name: '',
      remember: false
    })
  })
})

describe('readCookieValueRaw', () => {
  it('keeps the raw encoded cookie value intact', () => {
    expect(readCookieValueRaw(`${authNameCookieKey}=Fragment%20Prime`, authNameCookieKey)).toBe('Fragment%20Prime')
  })
})

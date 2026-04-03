import { describe, expect, it } from 'bun:test'

import {
  clearFragmentShellCache,
  getFragmentShellCacheEntry,
  setFragmentShellCacheEntry
} from './shell-cache'

describe('fragment shell cache', () => {
  it('keys cached entries by path, scope, language, and version signature', () => {
    setFragmentShellCacheEntry(
      '/chat',
      {
        plan: { path: '/chat', fragments: [] } as never,
        path: '/chat',
        lang: 'en',
        scopeKey: 'user:abc',
        versionSignature: 'v1',
        fragments: {},
        orderIds: [],
        expandedId: null,
        scrollY: 0,
        fields: {}
      },
      {
        scopeKey: 'user:abc',
        lang: 'en',
        versionSignature: 'v1'
      }
    )

    expect(
      getFragmentShellCacheEntry('/chat', {
        scopeKey: 'user:abc',
        lang: 'en',
        versionSignature: 'v1'
      })
    ).toBeTruthy()
    expect(
      getFragmentShellCacheEntry('/chat', {
        scopeKey: 'user:abc',
        lang: 'en',
        versionSignature: 'v2'
      })
    ).toBeUndefined()
  })

  it('clears only matching scoped entries when a path is provided', () => {
    clearFragmentShellCache()
    setFragmentShellCacheEntry(
      '/chat',
      {
        plan: { path: '/chat', fragments: [] } as never,
        path: '/chat',
        lang: 'en',
        scopeKey: 'public',
        versionSignature: 'v1',
        fragments: {},
        orderIds: [],
        expandedId: null,
        scrollY: 0,
        fields: {}
      },
      { scopeKey: 'public', lang: 'en', versionSignature: 'v1' }
    )
    setFragmentShellCacheEntry(
      '/chat',
      {
        plan: { path: '/chat', fragments: [] } as never,
        path: '/chat',
        lang: 'ja',
        scopeKey: 'public',
        versionSignature: 'v1',
        fragments: {},
        orderIds: [],
        expandedId: null,
        scrollY: 0,
        fields: {}
      },
      { scopeKey: 'public', lang: 'ja', versionSignature: 'v1' }
    )

    clearFragmentShellCache('/chat', { scopeKey: 'public', lang: 'en' })

    expect(
      getFragmentShellCacheEntry('/chat', {
        scopeKey: 'public',
        lang: 'en',
        versionSignature: 'v1'
      })
    ).toBeUndefined()
    expect(
      getFragmentShellCacheEntry('/chat', {
        scopeKey: 'public',
        lang: 'ja',
        versionSignature: 'v1'
      })
    ).toBeTruthy()
  })
})

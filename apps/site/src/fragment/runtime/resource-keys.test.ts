import { describe, expect, it } from 'bun:test'

import {
  buildFragmentPayloadResourceKey,
  parseFragmentPayloadResourceKey
} from './resource-keys'

describe('fragment payload resource keys', () => {
  it('normalizes trailing-slash paths when building and parsing keys', () => {
    const resourceKey = buildFragmentPayloadResourceKey({
      path: '/store/',
      lang: 'en',
      fragmentId: 'fragment://page/store/cart@v1'
    })

    expect(resourceKey).toBe(
      'data:fragment-payload:%2Fstore:en:fragment:%2F%2Fpage%2Fstore%2Fcart%40v1'
    )
    expect(parseFragmentPayloadResourceKey(resourceKey)).toEqual({
      path: '/store',
      lang: 'en',
      fragmentId: 'fragment://page/store/cart@v1'
    })
  })
})

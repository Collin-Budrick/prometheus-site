import { describe, expect, it } from 'bun:test'
import {
  buildHomeCollabOutboundUpdate,
  shouldUsePlainTextCollabInit
} from './home-collab-worker-transport'

describe('home collab worker transport', () => {
  it('treats matching snapshot and text payloads as the plain-text fallback protocol', () => {
    expect(
      shouldUsePlainTextCollabInit({
        snapshot: 'Write something. Everyone here sees it live.',
        text: 'Write something. Everyone here sees it live.'
      })
    ).toBe(true)

    expect(
      shouldUsePlainTextCollabInit({
        snapshot: 'AAECAw==',
        text: 'Write something. Everyone here sees it live.'
      })
    ).toBe(false)
  })

  it('serializes outbound updates for both CRDT and plain-text runtimes', () => {
    expect(
      buildHomeCollabOutboundUpdate({
        mode: 'crdt',
        clientId: 'client-1',
        update: 'AAECAw==',
        text: 'ignored'
      })
    ).toEqual({
      type: 'home-collab:update',
      update: 'AAECAw==',
      clientId: 'client-1'
    })

    expect(
      buildHomeCollabOutboundUpdate({
        mode: 'text',
        clientId: 'client-1',
        update: 'AAECAw==',
        text: 'hello world'
      })
    ).toEqual({
      type: 'home-collab:update',
      text: 'hello world',
      clientId: 'client-1'
    })
  })
})

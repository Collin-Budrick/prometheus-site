import { describe, expect, it } from 'bun:test'
import {
  parseHomeCollabUpdateEvent,
  resolveHomeCollabModeFromUpgradeContext
} from '@platform/server/home-collab'

describe('home collab websocket payload parsing', () => {
  const payload = {
    type: 'home-collab:update',
    update: 'abc123',
    clientId: 'client-1'
  } as const

  it('accepts already-parsed websocket objects from Elysia', () => {
    expect(parseHomeCollabUpdateEvent(payload)).toEqual(payload)
  })

  it('accepts JSON string websocket payloads', () => {
    expect(parseHomeCollabUpdateEvent(JSON.stringify(payload))).toEqual(payload)
  })

  it('accepts binary websocket payloads', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload))
    expect(parseHomeCollabUpdateEvent(bytes)).toEqual(payload)
    expect(parseHomeCollabUpdateEvent(bytes.buffer)).toEqual(payload)
  })

  it('rejects invalid payloads', () => {
    expect(parseHomeCollabUpdateEvent('not-json')).toBeNull()
    expect(parseHomeCollabUpdateEvent(123)).toBeNull()
    expect(parseHomeCollabUpdateEvent(null)).toBeNull()
  })

  it('resolves listener mode from websocket request URL search params', () => {
    expect(
      resolveHomeCollabModeFromUpgradeContext({
        request: new Request('https://prometheus.prod/api/home/collab/dock/ws?mode=listener')
      })
    ).toBe('listener')
  })

  it('defaults websocket mode to editor when the query is absent', () => {
    expect(
      resolveHomeCollabModeFromUpgradeContext({
        request: new Request('https://prometheus.prod/api/home/collab/dock/ws')
      })
    ).toBe('editor')
  })
})

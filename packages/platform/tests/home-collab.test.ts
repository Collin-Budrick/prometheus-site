import { describe, expect, it } from 'bun:test'
import { parseHomeCollabUpdateEvent } from '@platform/server/home-collab'

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
})

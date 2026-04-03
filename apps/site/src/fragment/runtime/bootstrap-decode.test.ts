import { describe, expect, it } from 'bun:test'
import type { FragmentPayload } from '../types'
import { decodeBootstrapFramesSerially } from './bootstrap-decode'

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('decodeBootstrapFramesSerially', () => {
  it('decodes bootstrap frames serially and preserves frame order', async () => {
    const started: string[] = []
    const resolved: string[] = []
    const resolvers = new Map<string, () => void>()
    let activeDecodes = 0
    let maxConcurrentDecodes = 0

    const pending = decodeBootstrapFramesSerially(
      [
        { id: 'fragment://tests/bootstrap/one@v1', payloadBytes: new Uint8Array([1]) },
        { id: 'fragment://tests/bootstrap/two@v1', payloadBytes: new Uint8Array([2]) },
        { id: 'fragment://tests/bootstrap/three@v1', payloadBytes: new Uint8Array([3]) }
      ],
      (fragmentId) =>
        new Promise<FragmentPayload>((resolve) => {
          started.push(fragmentId)
          activeDecodes += 1
          maxConcurrentDecodes = Math.max(maxConcurrentDecodes, activeDecodes)
          resolvers.set(fragmentId, () => {
            resolved.push(fragmentId)
            activeDecodes -= 1
            resolve({ id: fragmentId } as FragmentPayload)
          })
        })
    )

    expect(started).toEqual(['fragment://tests/bootstrap/one@v1'])
    expect(maxConcurrentDecodes).toBe(1)

    resolvers.get('fragment://tests/bootstrap/one@v1')?.()
    await flushMicrotasks()

    expect(started).toEqual([
      'fragment://tests/bootstrap/one@v1',
      'fragment://tests/bootstrap/two@v1'
    ])
    expect(resolved).toEqual(['fragment://tests/bootstrap/one@v1'])
    expect(maxConcurrentDecodes).toBe(1)

    resolvers.get('fragment://tests/bootstrap/two@v1')?.()
    await flushMicrotasks()

    expect(started).toEqual([
      'fragment://tests/bootstrap/one@v1',
      'fragment://tests/bootstrap/two@v1',
      'fragment://tests/bootstrap/three@v1'
    ])
    expect(resolved).toEqual([
      'fragment://tests/bootstrap/one@v1',
      'fragment://tests/bootstrap/two@v1'
    ])
    expect(maxConcurrentDecodes).toBe(1)

    resolvers.get('fragment://tests/bootstrap/three@v1')?.()

    const payloads = await pending

    expect(maxConcurrentDecodes).toBe(1)
    expect(payloads.map((payload) => payload.id)).toEqual([
      'fragment://tests/bootstrap/one@v1',
      'fragment://tests/bootstrap/two@v1',
      'fragment://tests/bootstrap/three@v1'
    ])
  })

  it('supports inline bootstrap decoding without an async worker pool', async () => {
    const payloads = await decodeBootstrapFramesSerially(
      [
        { id: 'fragment://tests/bootstrap/manifest@v1', payloadBytes: new Uint8Array([1, 2]) },
        { id: 'fragment://tests/bootstrap/dock@v1', payloadBytes: new Uint8Array([3, 4]) }
      ],
      (fragmentId, payloadBytes) =>
        ({
          id: fragmentId,
          meta: {
            cacheKey: fragmentId,
            ttl: payloadBytes.byteLength,
            staleTtl: 0,
            tags: [],
            runtime: 'edge'
          }
        }) as FragmentPayload
    )

    expect(payloads.map((payload) => payload.id)).toEqual([
      'fragment://tests/bootstrap/manifest@v1',
      'fragment://tests/bootstrap/dock@v1'
    ])
    expect(payloads.map((payload) => payload.meta.ttl)).toEqual([2, 2])
  })
})

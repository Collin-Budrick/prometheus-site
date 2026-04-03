import { describe, expect, it } from 'bun:test'

import {
  probeServerHealth,
  SERVER_HEALTH_INTERVAL_MS,
  shouldProbeServerHealth
} from './server-health'

describe('server-health', () => {
  it('treats ok responses as online', async () => {
    const result = await probeServerHealth({
      fetchImpl: async () => ({ ok: true }),
      url: 'https://prometheus.prod/health',
      source: 'heartbeat',
      now: () => 42
    })

    expect(result).toEqual({
      online: true,
      checkedAt: 42,
      key: 'prometheus.prod',
      source: 'heartbeat'
    })
  })

  it('treats non-ok responses and fetch failures as offline', async () => {
    const offlineResponse = await probeServerHealth({
      fetchImpl: async () => ({ ok: false }),
      url: 'https://prometheus.prod/health',
      source: 'heartbeat',
      now: () => 7
    })
    expect(offlineResponse.online).toBe(false)

    const thrown = await probeServerHealth({
      fetchImpl: async () => {
        throw new Error('boom')
      },
      url: 'https://prometheus.prod/health',
      source: 'periodic-sync',
      now: () => 9
    })
    expect(thrown).toEqual({
      online: false,
      checkedAt: 9,
      key: 'prometheus.prod',
      source: 'periodic-sync'
    })
  })

  it('aborts long-running probes when the timeout elapses', async () => {
    let aborted = false
    const result = await probeServerHealth({
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new Error('aborted'))
          })
        }),
      url: 'https://prometheus.prod/health',
      source: 'heartbeat',
      timeoutMs: 5,
      now: () => 15
    })

    expect(aborted).toBe(true)
    expect(result.online).toBe(false)
    expect(result.checkedAt).toBe(15)
  })

  it('throttles repeated probes inside the heartbeat window', () => {
    expect(shouldProbeServerHealth(null, 1000)).toBe(true)
    expect(shouldProbeServerHealth(1000, 1000 + SERVER_HEALTH_INTERVAL_MS - 1)).toBe(false)
    expect(shouldProbeServerHealth(1000, 1000 + SERVER_HEALTH_INTERVAL_MS)).toBe(true)
  })
})

import { describe, expect, it } from 'bun:test'

import {
  applyFragmentStatusIndicator,
  createDefaultServerReachabilitySnapshot,
  readFragmentRuntimeStateFromElement,
  resolveEffectiveFragmentStatus,
  writeServerReachabilitySnapshot
} from './server-reachability'

describe('server-reachability', () => {
  it('forces the indicator into error when the browser or server is offline', () => {
    expect(
      resolveEffectiveFragmentStatus('streaming', {
        online: false,
        browserOnline: true,
        checkedAt: 1,
        key: 'prometheus.prod',
        source: 'heartbeat'
      })
    ).toBe('error')

    expect(
      resolveEffectiveFragmentStatus('idle', {
        online: true,
        browserOnline: false,
        checkedAt: 2,
        key: 'prometheus.prod',
        source: 'offline-event'
      })
    ).toBe('error')
  })

  it('stores runtime state separately from the effective displayed state', () => {
    const element = {
      dataset: {} as Record<string, string>,
      attributes: new Map<string, string>(),
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value)
      }
    } as unknown as HTMLElement

    applyFragmentStatusIndicator({
      element,
      runtimeState: 'streaming',
      labels: {
        idle: 'Idle',
        streaming: 'Streaming',
        error: 'Stalled'
      },
      reachability: {
        online: false,
        browserOnline: true,
        checkedAt: 3,
        key: 'prometheus.prod',
        source: 'heartbeat'
      }
    })

    expect(element.dataset.runtimeState).toBe('streaming')
    expect(element.dataset.state).toBe('error')
    expect(element.attributes.get('aria-label')).toBe('Stalled')
    expect(readFragmentRuntimeStateFromElement(element)).toBe('streaming')
  })

  it('writes and reuses the shared window reachability snapshot', () => {
    const dispatched: Array<{ type: string; detail: unknown }> = []
    const target = {
      navigator: { onLine: true },
      dispatchEvent(event: Event) {
        dispatched.push({
          type: event.type,
          detail: (event as CustomEvent).detail
        })
        return true
      }
    } as unknown as Window & typeof globalThis

    const initial = createDefaultServerReachabilitySnapshot()
    expect(initial.online).toBe(true)

    const next = writeServerReachabilitySnapshot(
      {
        online: false,
        checkedAt: 11,
        key: 'prometheus.prod',
        source: 'heartbeat'
      },
      { target }
    )

    expect(next.online).toBe(false)
    expect(dispatched).toHaveLength(1)
  })
})

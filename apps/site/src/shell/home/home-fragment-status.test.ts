import { describe, expect, it } from 'bun:test'
import { updateFragmentStatusFromBootstrapData } from './home-fragment-status'

describe('home-fragment-status', () => {
  it('prefers seeded route labels and leaves existing aria labels intact when a label is missing', () => {
    const element = {
      dataset: {} as Record<string, string>,
      attributes: new Map<string, string>([['aria-label', 'Existing label']]),
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value)
      }
    }
    const doc = {
      querySelector: () => element as unknown as HTMLElement
    }
    const data = {
      shellSeed: {
        ui: {
          fragmentStatusIdle: 'Shell idle',
          fragmentStatusStreaming: 'Shell streaming'
        }
      },
      routeSeed: {
        ui: {
          fragmentStatusIdle: 'Route idle'
        }
      }
    }

    updateFragmentStatusFromBootstrapData(data as never, 'idle', {
      doc: doc as never
    })
    expect(element.dataset.state).toBe('idle')
    expect(element.attributes.get('aria-label')).toBe('Route idle')

    updateFragmentStatusFromBootstrapData(data as never, 'error', {
      doc: doc as never
    })
    expect(element.dataset.state).toBe('error')
    expect(element.attributes.get('aria-label')).toBe('Route idle')
  })
})

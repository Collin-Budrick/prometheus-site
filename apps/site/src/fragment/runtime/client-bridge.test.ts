import { describe, expect, it } from 'bun:test'
import { resolveFragmentSharedWorkerUrl } from './client-bridge'

describe('fragment runtime client bridge', () => {
  it('derives the shared worker asset URL from the static-shell script base', () => {
    const workerUrl = resolveFragmentSharedWorkerUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/fragment-static-entry.js?v=abc123'
              : null
        }
      ]
    })

    expect(workerUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/fragment/runtime/shared-worker.js?v=abc123'
    )
  })
})

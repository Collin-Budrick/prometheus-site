import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadFragmentBootstrapRuntime,
  resetFragmentBootstrapRuntimeLoaderForTests,
  resolveFragmentBootstrapRuntimeUrl,
  type FragmentBootstrapRuntimeModule
} from './runtime-loaders'

afterEach(() => {
  resetFragmentBootstrapRuntimeLoaderForTests()
})

describe('fragment-bootstrap-runtime-loader', () => {
  it('derives the runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveFragmentBootstrapRuntimeUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/shell/fragments/fragment-static-entry.js'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: FragmentBootstrapRuntimeModule = {
      bootstrapStaticFragmentShell: async () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js'

    const firstLoad = loadFragmentBootstrapRuntime({ assetUrl, importer })
    const secondLoad = loadFragmentBootstrapRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })

  it('retries a failed runtime import with a cache-busting query param', async () => {
    const calls: string[] = []
    const runtimeModule: FragmentBootstrapRuntimeModule = {
      bootstrapStaticFragmentShell: async () => undefined
    }
    const assetUrl =
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js?v=build123'
    const importer = async (url: string) => {
      calls.push(url)
      if (calls.length === 1) {
        throw new TypeError('Failed to fetch dynamically imported module')
      }
      return runtimeModule
    }

    expect(await loadFragmentBootstrapRuntime({ assetUrl, importer })).toBe(runtimeModule)
    expect(calls).toEqual([
      assetUrl,
      `${assetUrl}&__static_runtime_retry=2`
    ])
  })
})

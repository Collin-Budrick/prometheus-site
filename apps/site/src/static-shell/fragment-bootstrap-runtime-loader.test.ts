import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadFragmentBootstrapRuntime,
  resetFragmentBootstrapRuntimeLoaderForTests,
  resolveFragmentBootstrapRuntimeUrl,
  type FragmentBootstrapRuntimeModule
} from './fragment-bootstrap-runtime-loader'

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
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/fragment-static-entry.js'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js'
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
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js'

    const firstLoad = loadFragmentBootstrapRuntime({ assetUrl, importer })
    const secondLoad = loadFragmentBootstrapRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

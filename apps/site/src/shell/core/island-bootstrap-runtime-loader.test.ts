import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadIslandBootstrapRuntime,
  resetIslandBootstrapRuntimeLoaderForTests,
  resolveIslandBootstrapRuntimeUrl,
  type IslandBootstrapRuntimeModule
} from './runtime-loaders'

afterEach(() => {
  resetIslandBootstrapRuntimeLoaderForTests()
})

describe('island-bootstrap-runtime-loader', () => {
  it('derives the runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveIslandBootstrapRuntimeUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/shell/core/island-static-entry.js'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/core/island-bootstrap-runtime.js'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: IslandBootstrapRuntimeModule = {
      bootstrapStaticIslandShell: async () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/shell/core/island-bootstrap-runtime.js'

    const firstLoad = loadIslandBootstrapRuntime({ assetUrl, importer })
    const secondLoad = loadIslandBootstrapRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

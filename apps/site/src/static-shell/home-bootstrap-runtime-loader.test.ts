import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeBootstrapRuntime,
  resetHomeBootstrapRuntimeLoaderForTests,
  resolveHomeBootstrapRuntimeUrl,
  type HomeBootstrapRuntimeModule
} from './home-bootstrap-runtime-loader'

afterEach(() => {
  resetHomeBootstrapRuntimeLoaderForTests()
})

describe('home-bootstrap-runtime-loader', () => {
  it('derives the runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeBootstrapRuntimeUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-static-entry.js'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-bootstrap-anchor-runtime.js'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeBootstrapRuntimeModule = {
      bootstrapStaticHome: async () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-bootstrap-anchor-runtime.js'

    const firstLoad = loadHomeBootstrapRuntime({ assetUrl, importer })
    const secondLoad = loadHomeBootstrapRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

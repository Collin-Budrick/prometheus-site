import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeBootstrapPostLcpRuntime,
  resetHomeBootstrapPostLcpRuntimeLoaderForTests,
  resolveHomeBootstrapPostLcpRuntimeUrl,
  type HomeBootstrapPostLcpRuntimeModule
} from './home-bootstrap-post-lcp-runtime-loader'

afterEach(() => {
  resetHomeBootstrapPostLcpRuntimeLoaderForTests()
})

describe('home-bootstrap-post-lcp-runtime-loader', () => {
  it('derives the runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeBootstrapPostLcpRuntimeUrl({
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
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.js'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeBootstrapPostLcpRuntimeModule = {
      installHomeBootstrapPostLcpRuntime: () => () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl =
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.js'

    const firstLoad = loadHomeBootstrapPostLcpRuntime({ assetUrl, importer })
    const secondLoad = loadHomeBootstrapPostLcpRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeControllerRuntime,
  resetHomeControllerRuntimeLoaderForTests,
  resolveHomeControllerRuntimeUrl,
  type HomeControllerRuntimeModule
} from './runtime-loaders'

afterEach(() => {
  resetHomeControllerRuntimeLoaderForTests()
})

describe('home-controller-runtime-loader', () => {
  it('derives the runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeControllerRuntimeUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-static-entry.js'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-controller-runtime.js'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeControllerRuntimeModule = {
      destroyHomeController: async () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-controller-runtime.js'

    const firstLoad = loadHomeControllerRuntime({ assetUrl, importer })
    const secondLoad = loadHomeControllerRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

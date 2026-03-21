import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeDockAuthRuntime,
  resetHomeDockAuthRuntimeLoaderForTests,
  resolveHomeDockAuthRuntimeUrl,
  type HomeDockAuthRuntimeModule
} from './runtime-loaders'

afterEach(() => {
  resetHomeDockAuthRuntimeLoaderForTests()
})

describe('home-dock-auth-runtime-loader', () => {
  it('derives the dock auth runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeDockAuthRuntimeUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-static-entry.js?v=build123'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-dock-auth-runtime.js?v=build123'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeDockAuthRuntimeModule = {
      refreshHomeDockAuthIfNeeded: async () => undefined,
      syncHomeDockIfNeeded: async () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl =
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-dock-auth-runtime.js'

    const firstLoad = loadHomeDockAuthRuntime({ assetUrl, importer })
    const secondLoad = loadHomeDockAuthRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

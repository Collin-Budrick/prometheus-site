import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeDemoRuntime,
  resetHomeDemoRuntimeLoaderForTests,
  resolveHomeDemoRuntimeUrl,
  type HomeDemoRuntimeModule
} from './home-demo-runtime-loader'

afterEach(() => {
  resetHomeDemoRuntimeLoaderForTests()
})

describe('home-demo-runtime-loader', () => {
  it('derives the runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeDemoRuntimeUrl({
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

    expect(runtimeUrl).toBe('https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-runtime.js')
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeDemoRuntimeModule = {
      activateHomeDemo: async () => ({
        cleanup: () => undefined
      })
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-runtime.js'

    const firstLoad = loadHomeDemoRuntime({ assetUrl, importer })
    const secondLoad = loadHomeDemoRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeUiControlsRuntime,
  resetHomeUiControlsRuntimeLoaderForTests,
  resolveHomeUiControlsRuntimeUrl,
  type HomeUiControlsRuntimeModule
} from './home-ui-controls-runtime-loader'

afterEach(() => {
  resetHomeUiControlsRuntimeLoaderForTests()
})

describe('home-ui-controls-runtime-loader', () => {
  it('derives the UI controls runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeUiControlsRuntimeUrl({
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
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-ui-controls-runtime.js?v=build123'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeUiControlsRuntimeModule = {
      bindHomeUiControls: () => true
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl =
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-ui-controls-runtime.js'

    const firstLoad = loadHomeUiControlsRuntime({ assetUrl, importer })
    const secondLoad = loadHomeUiControlsRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

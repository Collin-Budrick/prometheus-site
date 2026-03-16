import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadFragmentHeightPatchRuntime,
  resetFragmentHeightPatchRuntimeLoaderForTests,
  resolveFragmentHeightPatchRuntimeUrl,
  type FragmentHeightPatchRuntimeModule
} from './fragment-height-patch-runtime-loader'

afterEach(() => {
  resetFragmentHeightPatchRuntimeLoaderForTests()
})

describe('fragment-height-patch-runtime-loader', () => {
  it('derives the patch runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveFragmentHeightPatchRuntimeUrl({
      origin: 'https://fallback.example',
      scripts: [
        {
          getAttribute: (name: string) =>
            name === 'src'
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-static-entry.js?v=build123'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe(
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/fragment-height-patch-runtime.js?v=build123'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: FragmentHeightPatchRuntimeModule = {
      settlePatchedFragmentCardHeight: async () => null
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl =
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/fragment-height-patch-runtime.js'

    const firstLoad = loadFragmentHeightPatchRuntime({ assetUrl, importer })
    const secondLoad = loadFragmentHeightPatchRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

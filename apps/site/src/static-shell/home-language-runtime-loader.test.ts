import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeLanguageRuntime,
  resetHomeLanguageRuntimeLoaderForTests,
  resolveHomeLanguageRuntimeUrl,
  type HomeLanguageRuntimeModule
} from './home-language-runtime-loader'

afterEach(() => {
  resetHomeLanguageRuntimeLoaderForTests()
})

describe('home-language-runtime-loader', () => {
  it('derives the language runtime asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeLanguageRuntimeUrl({
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
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-language-runtime.js?v=build123'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeLanguageRuntimeModule = {
      restorePreferredStaticHomeLanguage: async () => false,
      swapStaticHomeLanguage: async () => false
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl =
      'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-language-runtime.js'

    const firstLoad = loadHomeLanguageRuntime({ assetUrl, importer })
    const secondLoad = loadHomeLanguageRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

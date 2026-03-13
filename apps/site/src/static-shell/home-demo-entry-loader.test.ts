import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeDemoEntryRuntime,
  resetHomeDemoEntryRuntimeLoaderForTests,
  resolveHomeDemoEntryRuntimeUrl,
  type HomeDemoEntryModule
} from './home-demo-entry-loader'

afterEach(() => {
  resetHomeDemoEntryRuntimeLoaderForTests()
})

describe('home-demo-entry-loader', () => {
  it('derives the demo entry asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeDemoEntryRuntimeUrl({
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

    expect(runtimeUrl).toBe('https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-entry.js?v=build123')
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeDemoEntryModule = {
      installHomeDemoEntry: () => () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/static-shell/home-demo-entry.js'

    const firstLoad = loadHomeDemoEntryRuntime({ assetUrl, importer })
    const secondLoad = loadHomeDemoEntryRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

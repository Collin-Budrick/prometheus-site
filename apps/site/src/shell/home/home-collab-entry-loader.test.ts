import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeCollabEntryRuntime,
  resetHomeCollabEntryRuntimeLoaderForTests,
  resolveHomeCollabEntryRuntimeUrl,
  type HomeCollabEntryModule
} from './runtime-loaders'

afterEach(() => {
  resetHomeCollabEntryRuntimeLoaderForTests()
})

describe('home-collab-entry-loader', () => {
  it('derives the collab entry asset URL from the static-shell script base', () => {
    const runtimeUrl = resolveHomeCollabEntryRuntimeUrl({
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
      'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-collab-entry.js?v=build123'
    )
  })

  it('reuses the same import promise across repeated loads', async () => {
    const calls: string[] = []
    const runtimeModule: HomeCollabEntryModule = {
      installHomeCollabEntry: () => () => undefined
    }
    const importer = async (url: string) => {
      calls.push(url)
      return runtimeModule
    }
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-collab-entry.js'

    const firstLoad = loadHomeCollabEntryRuntime({ assetUrl, importer })
    const secondLoad = loadHomeCollabEntryRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })
})

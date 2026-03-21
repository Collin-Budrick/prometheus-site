import { afterEach, describe, expect, it } from 'bun:test'
import {
  loadHomeDemoEntryRuntime,
  resetHomeDemoEntryRuntimeLoaderForTests,
  resolveHomeDemoEntryRuntimeUrl,
  warmHomeDemoEntryRuntime,
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
              ? 'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-static-entry.js?v=build123'
              : null
        }
      ]
    })

    expect(runtimeUrl).toBe('https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-demo-entry.js?v=build123')
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
    const assetUrl = 'https://prometheus.prod/build/static-shell/apps/site/src/shell/home/home-demo-entry.js'

    const firstLoad = loadHomeDemoEntryRuntime({ assetUrl, importer })
    const secondLoad = loadHomeDemoEntryRuntime({ assetUrl, importer })

    expect(firstLoad).toBe(secondLoad)
    expect(await firstLoad).toBe(runtimeModule)
    expect(await secondLoad).toBe(runtimeModule)
    expect(calls).toEqual([assetUrl])
  })

  it('adds a modulepreload link when the demo entry runtime is warmed', async () => {
    const links: Array<Record<string, string>> = []
    const doc = {
      head: {
        appendChild(link: HTMLLinkElement) {
          links.push({
            rel: link.getAttribute('rel') ?? '',
            href: link.getAttribute('href') ?? '',
            preload: link.getAttribute('data-home-demo-entry-preload') ?? ''
          })
          return link
        }
      },
      createElement() {
        const attrs = new Map<string, string>()
        return {
          rel: '',
          setAttribute(name: string, value: string) {
            attrs.set(name, value)
            if (name === 'rel') {
              this.rel = value
            }
          },
          getAttribute(name: string) {
            return attrs.get(name) ?? null
          },
          addEventListener() {},
          removeEventListener() {}
        } as unknown as HTMLLinkElement
      },
      querySelector() {
        return null
      }
    }

    await warmHomeDemoEntryRuntime({
      doc: doc as unknown as Document
    })

    expect(links).toEqual([
      {
        rel: 'modulepreload',
        href: 'http://localhost/build/static-shell/apps/site/src/shell/home/home-demo-entry.js',
        preload: 'true'
      }
    ])
  })
})

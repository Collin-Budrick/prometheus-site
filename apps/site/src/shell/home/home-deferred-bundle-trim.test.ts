import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const readSource = async (path: string) =>
  await Bun.file(new URL(path, import.meta.url)).text()

const resolveMetafilePath = () =>
  fileURLToPath(new URL('../../../dist/.static-shell-meta/home-post-anchor-wrappers.json', import.meta.url))

describe('home deferred bundle trim', () => {
  it('keeps deferred bootstrap sources free of home copy and site config roots', async () => {
    const [
      deferredSource,
      controllerUtilsSource,
      preconnectSource,
      bootstrapDataSource,
      seedClientSource
    ] = await Promise.all([
      readSource('./home-bootstrap-deferred.ts'),
      readSource('./home-bootstrap-controller-utils.ts'),
      readSource('./home-post-anchor-preconnect.ts'),
      readSource('./home-bootstrap-data.ts'),
      readSource('../core/seed-client.ts')
    ])

    expect(controllerUtilsSource).not.toContain('./home-copy-store')
    expect(deferredSource).toContain('loadHomeBootstrapRuntime')
    expect(deferredSource).toContain('loadHomeControllerRuntime')
    expect(deferredSource).not.toContain("import('./home-bootstrap-orchestrator')")
    expect(deferredSource).not.toContain("import('./home-bootstrap-controller-utils')")
    expect(preconnectSource).not.toContain('../../site-config')
    expect(preconnectSource).not.toContain('@prometheus/template-config')
    expect(bootstrapDataSource).not.toContain("from './home-fragment-bootstrap'")
    expect(bootstrapDataSource).not.toContain("../core/constants")
    expect(seedClientSource).not.toContain("./constants")
  })

  it('keeps language payloads and template-config out of the deferred wrapper metafile when available', () => {
    const metafilePath = resolveMetafilePath()
    if (!existsSync(metafilePath)) {
      return
    }

    const metafile = JSON.parse(readFileSync(metafilePath, 'utf8')) as {
      outputs?: Record<string, { inputs?: Record<string, { bytesInOutput?: number }> }>
    }
    const outputKey = Object.keys(metafile.outputs ?? {}).find((key) =>
      key.endsWith('home-bootstrap-deferred-runtime.js')
    )

    expect(outputKey).toBeTruthy()

    const outputKeys = Object.keys(metafile.outputs ?? {})
    if (!outputKeys.some((key) => key.endsWith('home-controller-runtime.js'))) {
      return
    }

    const inputKeys = Object.keys(metafile.outputs?.[outputKey!]?.inputs ?? {})

    expect(inputKeys).not.toContain('apps/site/src/lang/en.json')
    expect(inputKeys).not.toContain('apps/site/src/lang/ja.json')
    expect(inputKeys).not.toContain('apps/site/src/lang/ko.json')
    expect(inputKeys).not.toContain('packages/template-config/src/index.ts')
  })
})

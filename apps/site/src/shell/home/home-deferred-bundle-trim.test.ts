import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const readSource = async (path: string) =>
  await Bun.file(new URL(path, import.meta.url)).text()

const resolveMetafilePath = (name: string) =>
  fileURLToPath(new URL(`../../../dist/.static-shell-meta/${name}`, import.meta.url))

const findOutputInputKeys = (
  metafileName: string,
  outputSuffix: string
) => {
  const metafilePath = resolveMetafilePath(metafileName)
  if (!existsSync(metafilePath)) {
    return null
  }

  const metafile = JSON.parse(readFileSync(metafilePath, 'utf8')) as {
    outputs?: Record<string, { inputs?: Record<string, { bytesInOutput?: number }> }>
  }
  const outputKey = Object.keys(metafile.outputs ?? {}).find((key) =>
    key.endsWith(outputSuffix)
  )

  if (!outputKey) {
    return null
  }

  return Object.keys(metafile.outputs?.[outputKey]?.inputs ?? {})
}

describe('home deferred bundle trim', () => {
  it('keeps deferred bootstrap sources free of home copy, heavy constants, and full bootstrap parser roots', async () => {
    const [
      deferredSource,
      controllerUtilsSource,
      preconnectSource,
      bootstrapDataSource,
      seedClientSource,
      lifecycleRuntimeSource,
      fragmentVersionStateSource,
      demoWarmCoreSource
    ] = await Promise.all([
      readSource('./home-bootstrap-deferred.ts'),
      readSource('./home-bootstrap-controller-utils.ts'),
      readSource('./home-post-anchor-preconnect.ts'),
      readSource('./home-bootstrap-data.ts'),
      readSource('../core/seed-client.ts'),
      readSource('./home-post-anchor-lifecycle-runtime.ts'),
      readSource('./home-fragment-version-state.ts'),
      readSource('./home-demo-warm-core.ts')
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
    expect(lifecycleRuntimeSource).not.toContain("./home-bootstrap-ui")
    expect(lifecycleRuntimeSource).toContain("./home-fragment-status")
    expect(lifecycleRuntimeSource).toContain("./home-demo-observe-event")
    expect(fragmentVersionStateSource).not.toContain("../core/constants")
    expect(fragmentVersionStateSource).toContain("../core/static-shell-dom-constants")
    expect(demoWarmCoreSource).not.toContain("./home-bootstrap-data")
    expect(demoWarmCoreSource).toContain("./home-demo-asset-data")
  })

  it('keeps language payloads and template-config out of the deferred wrapper metafile when available', () => {
    const inputKeys = findOutputInputKeys(
      'home-post-anchor-wrappers.json',
      'home-bootstrap-deferred-runtime.js'
    )
    if (!inputKeys) {
      return
    }

    expect(inputKeys).not.toContain('apps/site/src/lang/en.json')
    expect(inputKeys).not.toContain('apps/site/src/lang/ja.json')
    expect(inputKeys).not.toContain('apps/site/src/lang/ko.json')
    expect(inputKeys).not.toContain('packages/template-config/src/index.ts')
  })

  it('keeps lifecycle and controller bundles free of locale JSON and template config when metafiles are available', () => {
    const lifecycleInputKeys = findOutputInputKeys(
      'home-post-anchor-lifecycle.json',
      'home-post-anchor-lifecycle-runtime.js'
    )
    const controllerInputKeys = findOutputInputKeys(
      'home-post-anchor-lifecycle.json',
      'home-controller-runtime.js'
    )

    if (lifecycleInputKeys) {
      expect(lifecycleInputKeys).not.toContain('apps/site/src/lang/en.json')
      expect(lifecycleInputKeys).not.toContain('apps/site/src/lang/ja.json')
      expect(lifecycleInputKeys).not.toContain('apps/site/src/lang/ko.json')
      expect(lifecycleInputKeys).not.toContain('packages/template-config/src/index.ts')
      expect(lifecycleInputKeys).not.toContain('apps/site/src/site-config.ts')
    }

    if (controllerInputKeys) {
      expect(controllerInputKeys).not.toContain('packages/template-config/src/index.ts')
      expect(controllerInputKeys).not.toContain('apps/site/src/site-config.ts')
    }
  })

  it('keeps the demo warm bundle free of the full home bootstrap parser when its metafile is available', () => {
    const inputKeys = findOutputInputKeys(
      'home-demo-warm-core.json',
      'home-demo-warm-core.js'
    )
    if (!inputKeys) {
      return
    }

    expect(inputKeys).not.toContain('apps/site/src/shell/home/home-bootstrap-data.ts')
  })
})

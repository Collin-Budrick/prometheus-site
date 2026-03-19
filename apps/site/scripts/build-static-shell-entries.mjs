import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(siteRoot, '..', '..')

const outDir = path.resolve(siteRoot, 'dist', 'build', 'static-shell')
const metaDir = path.resolve(siteRoot, 'dist', '.static-shell-meta')
const publicPath = '/build/static-shell/'

const buildGroups = [
  {
    name: 'home-anchor-core',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-anchor-core.ts'
    ]
  },
  {
    name: 'home-anchor-wrappers',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-static-anchor-entry.ts',
      'apps/site/src/static-shell/home-bootstrap-anchor-runtime.ts'
    ]
  },
  {
    name: 'home-post-anchor-core',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-post-anchor-core.ts'
    ]
  },
  {
    name: 'home-post-anchor-wrappers',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-static-entry.ts',
      'apps/site/src/static-shell/home-bootstrap-deferred-runtime.ts'
    ]
  },
  {
    name: 'home-post-anchor-lifecycle',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-post-anchor-lifecycle-runtime.ts'
    ]
  },
  {
    name: 'home-demo-warm-core',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-demo-warm-core.ts'
    ]
  },
  {
    name: 'home-demo-warm-wrapper',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-static-entry-demo-warmup.ts'
    ]
  },
  {
    name: 'home-bootstrap',
    splitting: true,
    cssChunking: true,
    entrypoints: [
      'apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.ts',
      'apps/site/src/static-shell/home-ui-controls-runtime.ts',
      'apps/site/src/static-shell/home-language-runtime.ts',
      'apps/site/src/static-shell/home-dock-auth-runtime.ts'
    ]
  },
  {
    name: 'home-demo',
    splitting: true,
    cssChunking: true,
    entrypoints: [
      'apps/site/src/static-shell/home-demo-startup-entry.ts',
      'apps/site/src/static-shell/home-demo-attach-runtime.ts',
      'apps/site/src/static-shell/home-demo-entry.ts',
      'apps/site/src/static-shell/home-collab-entry.ts',
      'apps/site/src/static-shell/home-collab-editor-entry.ts',
      'apps/site/src/static-shell/home-demo-planner-runtime.ts',
      'apps/site/src/static-shell/home-demo-wasm-renderer-runtime.ts',
      'apps/site/src/static-shell/home-demo-react-binary-runtime.ts',
      'apps/site/src/static-shell/home-demo-preact-island-runtime.ts'
    ]
  },
  {
    name: 'static-support',
    splitting: true,
    cssChunking: true,
    entrypoints: [
      'apps/site/src/static-shell/fragment-height-patch-runtime.ts',
      'apps/site/src/static-shell/fragment-static-entry.ts',
      'apps/site/src/static-shell/fragment-bootstrap-runtime.ts',
      'apps/site/src/static-shell/store-static-runtime.ts',
      'apps/site/src/fragment/ui/fragment-widget-runtime.ts',
      'apps/site/src/static-shell/island-static-entry.ts',
      'apps/site/src/static-shell/island-bootstrap-runtime.ts'
    ]
  },
  {
    name: 'workers',
    splitting: false,
    cssChunking: false,
    entrypoints: [
      'apps/site/src/static-shell/home-collab.worker.ts',
      'apps/site/src/fragment/runtime/worker.ts',
      'apps/site/src/fragment/runtime/decode-pool.worker.ts'
    ]
  }
]

rmSync(outDir, { recursive: true, force: true })
rmSync(metaDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
mkdirSync(metaDir, { recursive: true })

const runBuildGroup = ({ name, entrypoints, splitting, cssChunking }) => {
  const metafilePath = path.resolve(metaDir, `${name}.json`)
  const args = [
    'build',
    ...entrypoints,
    '--outdir',
    outDir,
    '--target',
    'browser',
    '--format',
    'esm',
    '--minify',
    '--public-path',
    publicPath,
    '--root',
    '.',
    `--metafile=${metafilePath}`
  ]

  if (splitting) {
    args.push('--splitting')
  }
  if (cssChunking) {
    args.push('--css-chunking')
  }

  const result = spawnSync('bun', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

for (const buildGroup of buildGroups) {
  runBuildGroup(buildGroup)
}

const normalizeBundledAssetPaths = (dir) => {
  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      normalizeBundledAssetPaths(filePath)
      continue
    }
    if (!filePath.endsWith('.js')) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const nextSource = source.replace(
      /(['"])\/build\/static-shell\/(?:\.\.\/)+/g,
      '$1/build/static-shell/'
    )
    if (nextSource !== source) {
      writeFileSync(filePath, nextSource)
    }
  }
}

const sanitizeBundledWasmSourceMaps = (dir) => {
  const sourceMapSectionName = Buffer.from('sourceMappingURL')
  const disabledSourceMapSectionName = Buffer.from('ignoreMappingURL')
  const sourceMapUrl = Buffer.from(
    'https://unpkg.com/loro-crdt-map@1.10.6/bundler/loro_wasm_bg.wasm.map'
  )
  const disabledSourceMapUrl = Buffer.from('disabled-wasm-source-map'.padEnd(sourceMapUrl.length, ' '))

  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      sanitizeBundledWasmSourceMaps(filePath)
      continue
    }
    if (!filePath.endsWith('.wasm')) {
      continue
    }

    const source = readFileSync(filePath)
    let markerIndex = source.indexOf(sourceMapSectionName)
    if (markerIndex === -1) {
      continue
    }

    const nextSource = Buffer.from(source)
    while (markerIndex !== -1) {
      disabledSourceMapSectionName.copy(nextSource, markerIndex)
      markerIndex = source.indexOf(sourceMapSectionName, markerIndex + sourceMapSectionName.length)
    }

    let urlIndex = source.indexOf(sourceMapUrl)
    while (urlIndex !== -1) {
      disabledSourceMapUrl.copy(nextSource, urlIndex)
      urlIndex = source.indexOf(sourceMapUrl, urlIndex + sourceMapUrl.length)
    }
    writeFileSync(filePath, nextSource)
  }
}

const versionBundledWasmAssetPaths = (dir) => {
  const wasmVersions = new Map()

  const collectWasmVersions = (currentDir) => {
    for (const entry of readdirSync(currentDir)) {
      const filePath = path.join(currentDir, entry)
      const stat = statSync(filePath)
      if (stat.isDirectory()) {
        collectWasmVersions(filePath)
        continue
      }
      if (!filePath.endsWith('.wasm')) {
        continue
      }
      const source = readFileSync(filePath)
      const version = createHash('sha256').update(source).digest('hex').slice(0, 12)
      wasmVersions.set(path.basename(filePath), version)
    }
  }

  const rewriteWasmUrls = (currentDir) => {
    for (const entry of readdirSync(currentDir)) {
      const filePath = path.join(currentDir, entry)
      const stat = statSync(filePath)
      if (stat.isDirectory()) {
        rewriteWasmUrls(filePath)
        continue
      }
      if (!filePath.endsWith('.js')) {
        continue
      }

      const source = readFileSync(filePath, 'utf8')
      let nextSource = source
      for (const [fileName, version] of wasmVersions) {
        nextSource = nextSource.replaceAll(`${publicPath}${fileName}`, `${publicPath}${fileName}?v=${version}`)
      }
      if (nextSource !== source) {
        writeFileSync(filePath, nextSource)
      }
    }
  }

  collectWasmVersions(dir)
  rewriteWasmUrls(dir)
}

const normalizeOutputKey = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '')
const toAssetPath = (outputKey) => `${publicPath}${normalizeOutputKey(outputKey)}`.replace(/^\//, '')

const CURATED_PRELOAD_IMPORT_LIMITS = {
  'build/static-shell/apps/site/src/static-shell/home-static-anchor-entry.js': 2,
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-anchor-runtime.js': 2
}

const CURATED_ANCHOR_CORE_IMPORTS = {
  'build/static-shell/apps/site/src/static-shell/home-static-anchor-entry.js': [
    'apps/site/src/static-shell/home-anchor-core.js'
  ],
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-anchor-runtime.js': [
    'apps/site/src/static-shell/home-anchor-core.js'
  ]
}

const CURATED_POST_ANCHOR_CORE_IMPORTS = {
  'build/static-shell/apps/site/src/static-shell/home-static-entry.js': [
    'apps/site/src/static-shell/home-post-anchor-core.js'
  ],
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-deferred-runtime.js': [
    'apps/site/src/static-shell/home-post-anchor-core.js'
  ]
}

const CURATED_DEMO_WARM_CORE_IMPORTS = {
  'build/static-shell/apps/site/src/static-shell/home-static-entry-demo-warmup.js': [
    'apps/site/src/static-shell/home-demo-warm-core.js'
  ]
}

const resolveImportedOutputKey = (fromKey, importPath) => {
  if (!importPath || /^(?:[a-z]+:)?\/\//i.test(importPath)) {
    return null
  }
  if (importPath.startsWith('/')) {
    return normalizeOutputKey(importPath.replace(publicPath, ''))
  }
  return normalizeOutputKey(path.posix.join(path.posix.dirname(fromKey), importPath))
}

const buildChunkManifest = () => {
  const outputs = new Map()

  for (const entry of readdirSync(metaDir)) {
    if (!entry.endsWith('.json')) {
      continue
    }
    const metafile = JSON.parse(readFileSync(path.join(metaDir, entry), 'utf8'))
    const currentOutputs = metafile.outputs ?? {}
    for (const [outputKey, output] of Object.entries(currentOutputs)) {
      outputs.set(normalizeOutputKey(outputKey), output)
    }
  }

  const collectStaticImports = (entryKey, seen = new Set()) => {
    const output = outputs.get(entryKey)
    if (!output) {
      return []
    }

    const imports = []
    for (const outputImport of output.imports ?? []) {
      if (outputImport.kind !== 'import-statement') {
        continue
      }
      const importedKey = resolveImportedOutputKey(entryKey, outputImport.path)
      if (!importedKey || seen.has(importedKey) || !outputs.has(importedKey)) {
        continue
      }
      seen.add(importedKey)
      imports.push(importedKey, ...collectStaticImports(importedKey, seen))
    }

    return imports
  }

  const collectDirectStaticImports = (entryKey) => {
    const output = outputs.get(entryKey)
    if (!output) {
      return []
    }

    return (output.imports ?? [])
      .filter((outputImport) => outputImport.kind === 'import-statement')
      .map((outputImport) => resolveImportedOutputKey(entryKey, outputImport.path))
      .filter((importedKey) => importedKey && importedKey.endsWith('.js') && outputs.has(importedKey))
  }

  const entryImports = {}
  const preloadImports = {}
  const anchorCoreImports = {}
  const postAnchorCoreImports = {}
  const demoWarmCoreImports = {}
  for (const [outputKey, output] of outputs) {
    if (!output.entryPoint) {
      continue
    }
    const assetPath = toAssetPath(outputKey)
    entryImports[assetPath] = Array.from(
      new Set(
        collectStaticImports(outputKey)
          .filter((importedKey) => importedKey.endsWith('.js'))
          .map((importedKey) => toAssetPath(importedKey))
      )
    )

    const preloadLimit = CURATED_PRELOAD_IMPORT_LIMITS[assetPath]
    if (typeof preloadLimit === 'number' && preloadLimit > 0) {
      preloadImports[assetPath] = Array.from(
        new Set(
          collectDirectStaticImports(outputKey)
            .sort((left, right) => (outputs.get(right)?.bytes ?? 0) - (outputs.get(left)?.bytes ?? 0))
            .slice(0, preloadLimit)
            .map((importedKey) => toAssetPath(importedKey))
        )
      )
    }

    if (CURATED_ANCHOR_CORE_IMPORTS[assetPath]?.length) {
      anchorCoreImports[assetPath] = CURATED_ANCHOR_CORE_IMPORTS[assetPath]
        .filter((importedKey) => outputs.has(importedKey))
        .map((importedKey) => toAssetPath(importedKey))
    }

    if (CURATED_POST_ANCHOR_CORE_IMPORTS[assetPath]?.length) {
      postAnchorCoreImports[assetPath] = CURATED_POST_ANCHOR_CORE_IMPORTS[assetPath]
        .filter((importedKey) => outputs.has(importedKey))
        .map((importedKey) => toAssetPath(importedKey))
    }

    if (CURATED_DEMO_WARM_CORE_IMPORTS[assetPath]?.length) {
      demoWarmCoreImports[assetPath] = CURATED_DEMO_WARM_CORE_IMPORTS[assetPath]
        .filter((importedKey) => outputs.has(importedKey))
        .map((importedKey) => toAssetPath(importedKey))
    }
  }

  const assets = Array.from(outputs.keys()).map((outputKey) => toAssetPath(outputKey)).sort()

  writeFileSync(
    path.join(outDir, 'chunk-manifest.json'),
    JSON.stringify(
      {
        assets,
        entryImports,
        preloadImports,
        anchorCoreImports,
        postAnchorCoreImports,
        demoWarmCoreImports
      },
      null,
      2
    )
  )
}

normalizeBundledAssetPaths(outDir)
sanitizeBundledWasmSourceMaps(outDir)
versionBundledWasmAssetPaths(outDir)
buildChunkManifest()

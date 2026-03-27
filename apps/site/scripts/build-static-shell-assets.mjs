import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_PUBLIC_PATH = '/build/static-shell/'

const SOURCE_MAP_SECTION_NAME = Buffer.from('sourceMappingURL')
const DISABLED_SOURCE_MAP_SECTION_NAME = Buffer.from('ignoreMappingURL')
const SOURCE_MAP_URL = Buffer.from(
  'https://unpkg.com/loro-crdt-map@1.10.6/bundler/loro_wasm_bg.wasm.map'
)
const DISABLED_SOURCE_MAP_URL = Buffer.from('disabled-wasm-source-map'.padEnd(SOURCE_MAP_URL.length, ' '))

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normalizeOutputKey = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '')
const toAbsolutePath = (root, relativePath) => path.resolve(root, ...normalizeOutputKey(relativePath).split('/'))
const require = createRequire(import.meta.url)

export const STATIC_SHELL_WASM_STAGING_RULES = [
  {
    sourceSpecifier: 'loro-crdt/web/loro_wasm_bg.wasm',
    outputRelativePaths: ['apps/site/src/shell/home/home-collab.worker.js']
  }
]

const resolveWasmSourcePath = (siteRoot, rule) => {
  if (rule.sourcePath) {
    return path.resolve(rule.sourcePath)
  }
  if (rule.sourceRelativePath) {
    return toAbsolutePath(siteRoot, rule.sourceRelativePath)
  }
  if (rule.sourceSpecifier) {
    return require.resolve(rule.sourceSpecifier)
  }
  throw new Error('Missing static-shell Wasm source rule.')
}

export const normalizeBundledAssetPaths = (dir) => {
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

export const stageBundledWasmAssets = ({
  siteRoot,
  outDir,
  rules = STATIC_SHELL_WASM_STAGING_RULES
}) => {
  const copiedAssets = []

  for (const rule of rules) {
    const sourcePath = resolveWasmSourcePath(siteRoot, rule)
    if (!existsSync(sourcePath)) {
      throw new Error(
        `Missing static-shell Wasm source: ${rule.sourceSpecifier ?? rule.sourceRelativePath ?? rule.sourcePath}`
      )
    }

    for (const outputRelativePath of rule.outputRelativePaths) {
      const outputPath = toAbsolutePath(outDir, outputRelativePath)
      if (!existsSync(outputPath)) {
        throw new Error(`Missing static-shell Wasm target: ${outputRelativePath}`)
      }

      const destinationPath = path.join(path.dirname(outputPath), path.basename(sourcePath))
      mkdirSync(path.dirname(destinationPath), { recursive: true })
      copyFileSync(sourcePath, destinationPath)
      copiedAssets.push(destinationPath)
    }
  }

  return copiedAssets
}

export const sanitizeBundledWasmSourceMaps = (dir) => {
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
    let markerIndex = source.indexOf(SOURCE_MAP_SECTION_NAME)
    if (markerIndex === -1) {
      continue
    }

    const nextSource = Buffer.from(source)
    while (markerIndex !== -1) {
      DISABLED_SOURCE_MAP_SECTION_NAME.copy(nextSource, markerIndex)
      markerIndex = source.indexOf(SOURCE_MAP_SECTION_NAME, markerIndex + SOURCE_MAP_SECTION_NAME.length)
    }

    let urlIndex = source.indexOf(SOURCE_MAP_URL)
    while (urlIndex !== -1) {
      DISABLED_SOURCE_MAP_URL.copy(nextSource, urlIndex)
      urlIndex = source.indexOf(SOURCE_MAP_URL, urlIndex + SOURCE_MAP_URL.length)
    }
    writeFileSync(filePath, nextSource)
  }
}

export const versionBundledWasmAssetPaths = (
  dir,
  { publicPath = DEFAULT_PUBLIC_PATH } = {}
) => {
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
        const publicPathPattern = new RegExp(
          `${escapeRegex(publicPath)}${escapeRegex(fileName)}(?!\\?v=)`,
          'g'
        )
        nextSource = nextSource.replace(
          publicPathPattern,
          `${publicPath}${fileName}?v=${version}`
        )
        const relativeWasmUrlPattern = new RegExp(
          `(['"])${escapeRegex(fileName)}(?!\\?v=)\\1(?=\\s*,\\s*import\\.meta\\.url\\))`,
          'g'
        )
        nextSource = nextSource.replace(relativeWasmUrlPattern, (_match, quote) => {
          return `${quote}${fileName}?v=${version}${quote}`
        })
      }
      if (nextSource !== source) {
        writeFileSync(filePath, nextSource)
      }
    }
  }

  collectWasmVersions(dir)
  rewriteWasmUrls(dir)
}

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const CHUNK_IMPORT_PATTERN = /\/build\/static-shell\/chunk-[A-Za-z0-9_-]+\.(?:js|mjs|cjs)/gi

const collectJavaScriptFiles = (rootDir, currentDir = rootDir, files = []) => {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      collectJavaScriptFiles(rootDir, fullPath, files)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (!/\.(?:js|mjs|cjs)$/i.test(entry.name)) {
      continue
    }
    files.push(fullPath)
  }
  return files
}

const normalizeAssetHref = (value) => value.replace(/\\/g, '/')

export const collectMissingStaticShellChunkImports = (outDir) => {
  const missing = []
  const files = collectJavaScriptFiles(outDir)

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8')
    const matches = source.match(CHUNK_IMPORT_PATTERN) ?? []
    if (!matches.length) {
      continue
    }

    for (const assetHref of matches) {
      const relativeAssetPath = assetHref.replace('/build/static-shell/', '')
      const assetPath = path.join(outDir, relativeAssetPath)
      if (existsSync(assetPath)) {
        continue
      }
      missing.push({
        file: normalizeAssetHref(path.relative(outDir, filePath)),
        assetHref
      })
    }
  }

  return missing
}

export const assertStaticShellAssetIntegrity = (outDir) => {
  const missing = collectMissingStaticShellChunkImports(outDir)
  if (!missing.length) {
    return
  }

  const details = missing
    .map(({ file, assetHref }) => `  - ${file} -> ${assetHref}`)
    .join('\n')

  throw new Error(
    `Static-shell build emitted source entries or runtimes that reference missing chunk files.\n${details}`
  )
}

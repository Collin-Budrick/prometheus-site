import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOME_DEMO_RUNTIME_ASSET_PATHS } from './home-demo-runtime-types'

const STATIC_SHELL_RUNTIME_ASSET_PATHS = [
  'build/static-shell/apps/site/src/static-shell/home-static-entry.js',
  'build/static-shell/apps/site/src/static-shell/home-demo-entry.js',
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-runtime.js',
  'build/static-shell/apps/site/src/static-shell/fragment-static-entry.js',
  'build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js',
  'build/static-shell/apps/site/src/static-shell/store-static-runtime.js',
  'build/static-shell/apps/site/src/static-shell/island-static-entry.js',
  ...Object.values(HOME_DEMO_RUNTIME_ASSET_PATHS)
] as const

const STATIC_SHELL_BUILD_VERSION = (() => {
  const hash = createHash('sha256')
  let sawAsset = false

  for (const assetPath of STATIC_SHELL_RUNTIME_ASSET_PATHS) {
    const fileCandidates = [
      path.resolve(process.cwd(), 'dist', assetPath),
      fileURLToPath(new URL(`../dist/${assetPath}`, import.meta.url)),
      fileURLToPath(new URL(`../../dist/${assetPath}`, import.meta.url))
    ]
    const filePath = fileCandidates.find((candidate) => existsSync(candidate))
    hash.update(assetPath)
    if (!filePath) {
      hash.update('missing')
      continue
    }
    const stat = statSync(filePath)
    sawAsset = true
    hash.update(`${stat.size}:${stat.mtimeMs}`)
  }

  return sawAsset ? hash.digest('hex').slice(0, 12) : null
})()

export const getStaticShellBuildVersion = () => STATIC_SHELL_BUILD_VERSION

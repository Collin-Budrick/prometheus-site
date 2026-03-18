import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOME_DEMO_ENTRY_ASSET_PATH,
  HOME_DEMO_RUNTIME_ASSET_PATHS,
  HOME_DEMO_STARTUP_ENTRY_ASSET_PATH,
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH
} from './home-demo-runtime-types'
import {
  HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
  HOME_STATIC_ENTRY_ASSET_PATH
} from './home-static-entry-loader'
import { HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH } from './home-bootstrap-runtime-loader'

const STATIC_SHELL_RUNTIME_ASSET_PATHS = [
  HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
  HOME_STATIC_ENTRY_ASSET_PATH,
  HOME_DEMO_STARTUP_ENTRY_ASSET_PATH,
  HOME_DEMO_ENTRY_ASSET_PATH,
  'build/static-shell/apps/site/src/static-shell/home-collab-entry.js',
  'build/static-shell/apps/site/src/static-shell/home-collab-editor-entry.js',
  HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH,
  'build/static-shell/apps/site/src/static-shell/home-bootstrap-post-lcp-runtime.js',
  'build/static-shell/apps/site/src/static-shell/home-ui-controls-runtime.js',
  'build/static-shell/apps/site/src/static-shell/home-language-runtime.js',
  'build/static-shell/apps/site/src/static-shell/home-dock-auth-runtime.js',
  'build/static-shell/apps/site/src/static-shell/fragment-height-patch-runtime.js',
  'build/static-shell/apps/site/src/static-shell/fragment-static-entry.js',
  'build/static-shell/apps/site/src/static-shell/fragment-bootstrap-runtime.js',
  'build/static-shell/apps/site/src/static-shell/store-static-runtime.js',
  'build/static-shell/apps/site/src/static-shell/island-static-entry.js',
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH,
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

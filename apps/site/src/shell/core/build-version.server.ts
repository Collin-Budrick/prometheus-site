import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOME_DEMO_ENTRY_ASSET_PATH,
  HOME_DEMO_RUNTIME_ASSET_PATHS,
  HOME_DEMO_STARTUP_ENTRY_ASSET_PATH,
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH
} from '../home/home-demo-runtime-types'
import { FRAGMENT_WIDGET_RUNTIME_ASSET_PATH } from '../../fragment/ui/fragment-widget-runtime-loader'
import {
  HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
  HOME_STATIC_ENTRY_ASSET_PATH
} from '../home/home-static-entry-loader'
import { HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH } from '../home/home-static-entry-demo-warmup-loader'
import { HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH } from '../home/home-bootstrap-runtime-loader'
import { HOME_BOOTSTRAP_DEFERRED_RUNTIME_ASSET_PATH } from '../home/home-bootstrap-deferred-runtime-loader'
import { getStaticShellBuildAssetPaths } from './build-manifest.server'
import { HOME_ANCHOR_CORE_ASSET_PATH } from '../home/home-anchor-core-loader'
import { HOME_POST_ANCHOR_CORE_ASSET_PATH } from '../home/home-post-anchor-core-loader'
import { HOME_DEMO_WARM_CORE_ASSET_PATH } from '../home/home-demo-warm-core-loader'
import { HOME_POST_ANCHOR_LIFECYCLE_RUNTIME_ASSET_PATH } from '../home/home-post-anchor-lifecycle-runtime-loader'
import { HOME_COLLAB_WORKER_ASSET_PATH } from '../home/home-collab-worker-loader'

const STATIC_SHELL_RUNTIME_ASSET_PATHS_FALLBACK = [
  HOME_STATIC_ANCHOR_ENTRY_ASSET_PATH,
  HOME_ANCHOR_CORE_ASSET_PATH,
  HOME_STATIC_ENTRY_ASSET_PATH,
  HOME_POST_ANCHOR_CORE_ASSET_PATH,
  HOME_POST_ANCHOR_LIFECYCLE_RUNTIME_ASSET_PATH,
  HOME_STATIC_ENTRY_DEMO_WARMUP_ASSET_PATH,
  HOME_DEMO_WARM_CORE_ASSET_PATH,
  HOME_DEMO_STARTUP_ENTRY_ASSET_PATH,
  HOME_DEMO_ENTRY_ASSET_PATH,
  'build/static-shell/apps/site/src/shell/home/home-collab-entry.js',
  'build/static-shell/apps/site/src/shell/home/home-collab-editor-entry.js',
  HOME_COLLAB_WORKER_ASSET_PATH,
  HOME_BOOTSTRAP_ANCHOR_RUNTIME_ASSET_PATH,
  HOME_BOOTSTRAP_DEFERRED_RUNTIME_ASSET_PATH,
  'build/static-shell/apps/site/src/shell/home/home-bootstrap-post-lcp-runtime.js',
  'build/static-shell/apps/site/src/shell/home/home-ui-controls-runtime.js',
  'build/static-shell/apps/site/src/shell/home/home-language-runtime.js',
  'build/static-shell/apps/site/src/shell/home/home-dock-auth-runtime.js',
  'build/static-shell/apps/site/src/shell/fragments/fragment-height-patch-runtime.js',
  'build/static-shell/apps/site/src/shell/fragments/fragment-static-entry.js',
  'build/static-shell/apps/site/src/shell/fragments/fragment-bootstrap-runtime.js',
  'build/static-shell/apps/site/src/shell/store/store-static-runtime.js',
  FRAGMENT_WIDGET_RUNTIME_ASSET_PATH,
  'build/static-shell/apps/site/src/shell/core/island-static-entry.js',
  HOME_DEMO_STARTUP_ATTACH_RUNTIME_ASSET_PATH,
  ...Object.values(HOME_DEMO_RUNTIME_ASSET_PATHS)
] as const

const STATIC_SHELL_RUNTIME_ASSET_PATHS = (() => {
  const manifestAssets = getStaticShellBuildAssetPaths()
  return manifestAssets.length > 0 ? manifestAssets : [...STATIC_SHELL_RUNTIME_ASSET_PATHS_FALLBACK]
})()

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

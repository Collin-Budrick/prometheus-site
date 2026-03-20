import type { Alias } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))

export const siteConfigRoot = path.resolve(scriptsRoot, '..')
export const siteWorkspaceRoot = path.resolve(siteConfigRoot, '../..')

const coreRoot = path.resolve(siteWorkspaceRoot, 'packages/core/src')
const platformRoot = path.resolve(siteWorkspaceRoot, 'packages/platform/src')
const uiRoot = path.resolve(siteWorkspaceRoot, 'packages/ui/src')
const siteRoot = path.resolve(siteWorkspaceRoot, 'apps/site/src')
const featureAuthRoot = path.resolve(siteWorkspaceRoot, 'packages/features/auth/src')
const featureStoreRoot = path.resolve(siteWorkspaceRoot, 'packages/features/store/src')
const featureMessagingRoot = path.resolve(siteWorkspaceRoot, 'packages/features/messaging/src')
const featureLabRoot = path.resolve(siteWorkspaceRoot, 'packages/features/lab/src')

export const createSiteResolveAliases = (): Alias[] => {
  return [
    { find: '@', replacement: path.resolve(siteConfigRoot, 'src') },
    { find: /^@core$/, replacement: path.join(coreRoot, 'index.ts') },
    { find: /^@core\/(.*)$/, replacement: path.join(coreRoot, '$1') },
    { find: /^@platform$/, replacement: path.join(platformRoot, 'index.ts') },
    { find: /^@platform\/(.*)$/, replacement: path.join(platformRoot, '$1') },
    { find: /^@ui$/, replacement: path.join(uiRoot, 'index.ts') },
    { find: /^@ui\/(.*)$/, replacement: path.join(uiRoot, '$1') },
    { find: /^@prometheus\/ui$/, replacement: path.join(uiRoot, 'index.ts') },
    { find: /^@prometheus\/ui\/(.*)$/, replacement: path.join(uiRoot, '$1') },
    { find: /^@site$/, replacement: path.join(siteRoot, 'index.ts') },
    { find: /^@site\/(.*)$/, replacement: path.join(siteRoot, '$1') },
    { find: /^@features\/auth$/, replacement: path.join(featureAuthRoot, 'index.ts') },
    { find: /^@features\/auth\/(.*)$/, replacement: path.join(featureAuthRoot, '$1') },
    { find: /^@features\/store$/, replacement: path.join(featureStoreRoot, 'index.ts') },
    { find: /^@features\/store\/(.*)$/, replacement: path.join(featureStoreRoot, '$1') },
    { find: /^@features\/messaging$/, replacement: path.join(featureMessagingRoot, 'index.ts') },
    { find: /^@features\/messaging\/(.*)$/, replacement: path.join(featureMessagingRoot, '$1') },
    { find: /^@features\/lab$/, replacement: path.join(featureLabRoot, 'index.ts') },
    { find: /^@features\/lab\/(.*)$/, replacement: path.join(featureLabRoot, '$1') }
  ]
}

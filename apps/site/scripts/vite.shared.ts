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
    { find: /^@site\/(.*)$/, replacement: path.join(siteRoot, '$1') }
  ]
}

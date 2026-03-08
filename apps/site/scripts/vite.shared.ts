import type { Alias } from 'vite'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
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

const resolveOptionalPackageEntry = (id: string) => {
  try {
    return require.resolve(id)
  } catch {
    return null
  }
}

export const createSiteResolveAliases = (): Alias[] => {
  const tauriDeepLinkPluginEntry = resolveOptionalPackageEntry('@tauri-apps/plugin-deep-link')
  const tauriDialogPluginEntry = resolveOptionalPackageEntry('@tauri-apps/plugin-dialog')
  const tauriGlobalShortcutPluginEntry = resolveOptionalPackageEntry('@tauri-apps/plugin-global-shortcut')
  const tauriNotificationPluginEntry = resolveOptionalPackageEntry('@tauri-apps/plugin-notification')
  const tauriSqlPluginEntry = resolveOptionalPackageEntry('@tauri-apps/plugin-sql')
  const tauriShellPluginEntry = resolveOptionalPackageEntry('@tauri-apps/plugin-shell')
  const tauriUpdaterPluginEntry = resolveOptionalPackageEntry('@tauri-apps/plugin-updater')

  return [
    ...(tauriDeepLinkPluginEntry
      ? [{ find: '@tauri-apps/plugin-deep-link', replacement: tauriDeepLinkPluginEntry }]
      : []),
    ...(tauriDialogPluginEntry
      ? [{ find: '@tauri-apps/plugin-dialog', replacement: tauriDialogPluginEntry }]
      : []),
    ...(tauriGlobalShortcutPluginEntry
      ? [{ find: '@tauri-apps/plugin-global-shortcut', replacement: tauriGlobalShortcutPluginEntry }]
      : []),
    ...(tauriNotificationPluginEntry
      ? [{ find: '@tauri-apps/plugin-notification', replacement: tauriNotificationPluginEntry }]
      : []),
    ...(tauriSqlPluginEntry
      ? [{ find: '@tauri-apps/plugin-sql', replacement: tauriSqlPluginEntry }]
      : []),
    ...(tauriShellPluginEntry
      ? [{ find: '@tauri-apps/plugin-shell', replacement: tauriShellPluginEntry }]
      : []),
    ...(tauriUpdaterPluginEntry
      ? [{ find: '@tauri-apps/plugin-updater', replacement: tauriUpdaterPluginEntry }]
      : []),
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

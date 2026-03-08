import type { StorybookConfig } from 'storybook-framework-qwik'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { mergeConfig } from 'vite'
import { resolveAppConfig } from '../../../packages/platform/src/env.ts'
import { createSiteResolveAliases, siteConfigRoot, siteWorkspaceRoot } from '../scripts/vite.shared.ts'

const resolveStorybookAppConfig = (configType: 'DEVELOPMENT' | 'PRODUCTION') =>
  resolveAppConfig({
    DEV: configType === 'DEVELOPMENT' ? 'true' : 'false',
    MODE: configType === 'DEVELOPMENT' ? 'development' : 'production',
    NODE_ENV: configType === 'DEVELOPMENT' ? 'development' : 'production',
    VITE_API_BASE: '/api',
    VITE_ENABLE_ANALYTICS: '0',
    VITE_ENABLE_HIGHLIGHT: '0',
    VITE_ENABLE_PREFETCH: '0',
    VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: '0',
    VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: '0',
    VITE_ENABLE_FRAGMENT_COMPRESSION: '0',
    VITE_ENABLE_FRAGMENT_STREAMING: '0'
  })

const siteStoriesRoot = siteConfigRoot.replaceAll('\\', '/')
const workspaceStoriesRoot = siteWorkspaceRoot.replaceAll('\\', '/')

const config: StorybookConfig = {
  framework: {
    name: 'storybook-framework-qwik'
  },
  stories: [
    path.posix.join(siteStoriesRoot, 'src/**/*.stories.@(ts|tsx)'),
    path.posix.join(workspaceStoriesRoot, 'packages/ui/src/**/*.stories.@(ts|tsx)')
  ],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: ['../public'],
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: './__storybook_vite_disabled__.ts'
      }
    }
  },
  async viteFinal(config, { configType }) {
    const resolvedConfigType = configType === 'PRODUCTION' ? 'PRODUCTION' : 'DEVELOPMENT'

    return mergeConfig(config, {
      root: siteConfigRoot,
      define: {
        __HIGHLIGHT_BUILD_ENABLED__: 'false',
        __PUBLIC_APP_CONFIG__: JSON.stringify(resolveStorybookAppConfig(resolvedConfigType))
      },
      plugins: [tailwindcss()],
      resolve: {
        alias: createSiteResolveAliases()
      },
      optimizeDeps: {
        exclude: ['@bokuweb/zstd-wasm', '@builder.io/qwik-city', '@builder.io/qwik', '@qwik-client-manifest']
      },
      css: {
        transformer: 'lightningcss'
      },
      server: {
        fs: {
          allow: [siteWorkspaceRoot]
        }
      }
    })
  }
}

export default config

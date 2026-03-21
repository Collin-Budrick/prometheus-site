import type { StorybookConfig } from 'storybook-framework-qwik'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { mergeConfig } from 'vite'
import { collectTemplateStoryGlobs, resolveTemplateFeatures } from '@prometheus/template-config'
import { resolveAppConfig } from '../../../packages/platform/src/config.ts'
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
    VITE_ENABLE_FRAGMENT_STREAMING: '0',
    PROMETHEUS_TEMPLATE_PRESET: process.env.PROMETHEUS_TEMPLATE_PRESET ?? '',
    PROMETHEUS_TEMPLATE_HOME_MODE: process.env.PROMETHEUS_TEMPLATE_HOME_MODE ?? '',
    PROMETHEUS_TEMPLATE_FEATURES: process.env.PROMETHEUS_TEMPLATE_FEATURES ?? '',
    PROMETHEUS_TEMPLATE_DISABLE_FEATURES: process.env.PROMETHEUS_TEMPLATE_DISABLE_FEATURES ?? ''
  })

const workspaceStoriesRoot = siteWorkspaceRoot.replaceAll('\\', '/')
const storybookTemplate = resolveTemplateFeatures(process.env)
const templateStoryGlobs = collectTemplateStoryGlobs(storybookTemplate).map((pattern) =>
  path.posix.join(workspaceStoriesRoot, pattern)
)

const config: StorybookConfig = {
  framework: {
    name: 'storybook-framework-qwik'
  },
  stories: [
    ...templateStoryGlobs,
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
        __PUBLIC_APP_CONFIG__: JSON.stringify(resolveStorybookAppConfig(resolvedConfigType)),
        __STORYBOOK_TEMPLATE__: JSON.stringify(storybookTemplate)
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

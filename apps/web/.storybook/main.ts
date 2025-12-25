import type { StorybookConfig } from 'storybook-framework-qwik'
import UnoCSS from 'unocss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const config: StorybookConfig = {
  framework: 'storybook-framework-qwik',
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  staticDirs: ['../public'],
  addons: [],
  viteFinal: async (currentConfig) => {
    const plugins = currentConfig.plugins ? [...currentConfig.plugins] : []
    plugins.push(tsconfigPaths(), UnoCSS())
    const optimizeDeps = currentConfig.optimizeDeps ?? {}
    const include = new Set(optimizeDeps.include ?? [])
    const exclude = new Set(optimizeDeps.exclude ?? [])
    include.delete('compiled-i18n')
    include.delete('compiled-i18n/qwik')
    exclude.delete('compiled-i18n')
    exclude.delete('compiled-i18n/qwik')

    return {
      ...currentConfig,
      plugins,
      optimizeDeps: {
        ...optimizeDeps,
        include: [...include],
        exclude: [...exclude]
      }
    }
  }
}

export default config

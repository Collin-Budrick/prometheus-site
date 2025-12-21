import type { Plugin } from 'vite'

declare module 'compiled-i18n/vite' {
  interface Options {
    locales?: string[]
    localesDir?: string
    defaultLocale?: string
    babelPlugins?: any[]
    assetsDir?: string
    addMissing?: boolean
    removeUnusedKeys?: boolean
    tabs?: boolean
    lazy?: boolean
  }

  export function i18nPlugin(options?: Options): Plugin[]
}

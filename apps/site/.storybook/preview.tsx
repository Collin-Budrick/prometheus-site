import type { Preview } from 'storybook-framework-qwik'
import { type AppConfig, resolveAppConfig } from '@platform/env'
import { defaultLanguage, getLanguagePack } from '../src/lang'
import { seedLanguageResources } from '../src/lang/client'
import { LangProvider } from '../src/shared/lang-bridge'
import '@prometheus/ui/global.css'

type StorybookGlobalTarget = typeof globalThis & {
  __PUBLIC_APP_CONFIG__?: AppConfig | undefined
}

const storybookAppConfig = resolveAppConfig({
  DEV: 'true',
  MODE: 'development',
  NODE_ENV: 'development',
  VITE_API_BASE: '/api',
  VITE_ENABLE_ANALYTICS: '0',
  VITE_ENABLE_HIGHLIGHT: '0',
  VITE_ENABLE_PREFETCH: '0',
  VITE_ENABLE_WEBTRANSPORT_FRAGMENTS: '0',
  VITE_ENABLE_WEBTRANSPORT_DATAGRAMS: '0',
  VITE_ENABLE_FRAGMENT_COMPRESSION: '0',
  VITE_ENABLE_FRAGMENT_STREAMING: '0'
})

;(globalThis as StorybookGlobalTarget).__PUBLIC_APP_CONFIG__ = storybookAppConfig
seedLanguageResources(defaultLanguage, getLanguagePack(defaultLanguage), { full: true })

if (typeof document !== 'undefined' && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = 'light'
  document.documentElement.style.colorScheme = 'light'
}

const preview: Preview = {
  parameters: {
    a11y: {
      config: {},
      options: {
        checks: {
          'color-contrast': { options: { noScroll: true } }
        },
        restoreScroll: true
      }
    },
    options: {
      showRoots: true
    }
  },
  decorators: [
    (Story) => (
      <LangProvider initialLang={defaultLanguage}>{Story()}</LangProvider>
    )
  ]
}

export default preview

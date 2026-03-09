import type { Preview } from 'storybook-framework-qwik'
import type { PublicAppConfig } from '../src/public-app-config'
import { defaultLanguage, getLanguagePack } from '../src/lang'
import { seedLanguageResources } from '../src/lang/client'
import { LangProvider } from '../src/shared/lang-bridge'
import '@prometheus/ui/global.css'

type StorybookGlobalTarget = typeof globalThis & {
  __PUBLIC_APP_CONFIG__?: PublicAppConfig | undefined
}

const storybookAppConfig: PublicAppConfig = {
  apiBase: '/api',
  webTransportBase: '',
  preferWebTransport: false,
  preferWebTransportDatagrams: false,
  preferFragmentCompression: false,
  enableFragmentStreaming: false,
  fragmentVisibilityMargin: '60% 0px',
  fragmentVisibilityThreshold: 0.4,
  enablePrefetch: false,
  analytics: {
    enabled: false,
    beaconUrl: ''
  },
  highlight: {
    enabled: false,
    projectId: '',
    privacySetting: 'strict',
    enableSessionRecording: true,
    enableCanvasRecording: false,
    sampleRate: 0.1,
    environment: 'development',
    serviceName: 'site'
  },
  p2pRelayBases: [],
  p2pNostrRelays: [],
  p2pWakuRelays: [],
  p2pCrdtSignaling: [],
  p2pIceServers: []
}

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

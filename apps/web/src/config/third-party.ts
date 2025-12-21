export type ThirdPartyCategory = 'analytics' | 'ads' | 'widget'
export type ScriptLoad = 'defer' | 'idle' | 'interaction'

export type ThirdPartyScript = {
  id: string
  label: string
  category: ThirdPartyCategory
  src?: string
  inline?: string
  forward?: string[]
  attributes?: Record<string, string | boolean | undefined>
  budgetKb: number
  load: ScriptLoad
  partytown: boolean
  fallback?: string
  when: boolean
}

const readEnv = (key: string) => {
  const viteEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) as string | undefined
  if (viteEnv !== undefined) return viteEnv
  if (typeof process !== 'undefined') {
    return process.env?.[key] ?? process.env?.[key.replace(/^VITE_/, '')]
  }
  return undefined
}

export type ThirdPartyEnv = {
  gaId?: string
  adsClient?: string
  supportWidgetSrc?: string
}

const envKeyByProperty: Record<keyof ThirdPartyEnv, string> = {
  gaId: 'VITE_GTAG_ID',
  adsClient: 'VITE_ADSENSE_CLIENT',
  supportWidgetSrc: 'VITE_SUPPORT_WIDGET_SRC'
}

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

const validateEnvId = (key: keyof ThirdPartyEnv, value: string | undefined, pattern: RegExp, hint: string) => {
  const normalized = normalizeEnvValue(value)
  if (!normalized) return undefined

  if (!pattern.test(normalized)) {
    throw new Error(`${envKeyByProperty[key]} is set but invalid. Expected ${hint}.`)
  }

  return normalized
}

export const validateThirdPartyEnv = (raw: ThirdPartyEnv): ThirdPartyEnv => {
  const gaId = validateEnvId('gaId', raw.gaId, /^G-[A-Z0-9-]+$/, 'a GA4 measurement ID like G-XXXXXXX')
  const adsClient = validateEnvId(
    'adsClient',
    raw.adsClient,
    /^ca-pub-\d{16}$/,
    'an AdSense client ID like ca-pub-1234567890123456'
  )

  const supportWidgetSrc = normalizeEnvValue(raw.supportWidgetSrc)
  if (supportWidgetSrc) {
    try {
      const url = new URL(supportWidgetSrc)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('')
      }
    } catch {
      throw new Error(
        `${envKeyByProperty.supportWidgetSrc} is set but invalid. Expected an absolute http/https URL.`
      )
    }
  }

  return { gaId, adsClient, supportWidgetSrc }
}

const env = validateThirdPartyEnv({
  gaId: readEnv('VITE_GTAG_ID'),
  adsClient: readEnv('VITE_ADSENSE_CLIENT'),
  supportWidgetSrc: readEnv('VITE_SUPPORT_WIDGET_SRC')
})

const isPreview = import.meta.env.PROD

const definitions: ThirdPartyScript[] = [
  {
    id: 'gtag',
    label: 'Google Analytics 4',
    category: 'analytics',
    src: env.gaId ? `https://www.googletagmanager.com/gtag/js?id=${env.gaId}` : undefined,
    inline: env.gaId
      ? `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${env.gaId}', { transport_type: 'beacon', send_page_view: true });`
      : undefined,
    forward: ['dataLayer.push', 'gtag'],
    attributes: { async: true, 'data-gtm-id': env.gaId },
    budgetKb: 90,
    load: isPreview ? 'interaction' : 'defer',
    partytown: true,
    fallback: isPreview
      ? 'Loads after explicit consent; falls back to async tag when Partytown is disabled.'
      : 'Falls back to async tag when Partytown is disabled.',
    when: Boolean(env.gaId)
  },
  {
    id: 'adsense',
    label: 'Google AdSense',
    category: 'ads',
    src: env.adsClient
      ? `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${env.adsClient}`
      : undefined,
    forward: ['adsbygoogle.push'],
    attributes: { async: true, 'data-ad-client': env.adsClient, crossOrigin: 'anonymous' },
    budgetKb: 95,
    load: isPreview ? 'interaction' : 'idle',
    partytown: true,
    fallback: isPreview
      ? 'Loads after explicit consent; falls back to async tag when Partytown is disabled.'
      : 'Loads on idle/timeout when Partytown is off to avoid blocking hydration.',
    when: Boolean(env.adsClient)
  },
  {
    id: 'support-widget',
    label: 'Support chat widget',
    category: 'widget',
    src: env.supportWidgetSrc,
    budgetKb: 120,
    load: 'interaction',
    partytown: isPreview,
    fallback: isPreview
      ? 'Injected after explicit consent; stays off the main thread when Partytown is enabled.'
      : 'Injected after user input, idle callback, or 5s timeout.',
    when: Boolean(env.supportWidgetSrc)
  }
]

export const thirdPartyCatalog = definitions
export const thirdPartyScripts = definitions.filter((entry) => entry.when)
export const partytownForwards = Array.from(
  new Set(definitions.flatMap((entry) => entry.forward ?? []))
)

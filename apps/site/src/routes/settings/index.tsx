import { $, component$, useSignal } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { appConfig } from '../../app-config'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'

type ProtectedRouteData = {
  lang: Lang
}

const isLocalHost = (hostname: string) => hostname === '127.0.0.1' || hostname === 'localhost'

const resolveAuthBase = (origin: string, apiBase?: string) => {
  if (!apiBase) return ''
  if (apiBase.startsWith('/')) return apiBase
  try {
    const apiUrl = new URL(apiBase)
    const originUrl = new URL(origin)
    const apiHost = apiUrl.hostname
    const originHost = originUrl.hostname
    if (isLocalHost(apiHost) && !isLocalHost(originHost) && apiHost !== originHost) {
      return '/api'
    }
  } catch {
    return ''
  }
  return apiBase
}

const buildApiUrl = (path: string, origin: string, apiBase?: string) => {
  const base = resolveAuthBase(origin, apiBase)
  if (!base) return `${origin}${path}`

  if (base.startsWith('/')) {
    if (path.startsWith(base)) return `${origin}${path}`
    return `${origin}${base}${path}`
  }

  if (path.startsWith('/api')) {
    const normalizedBase = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${normalizedBase}${path}`
  }

  return `${base}${path}`
}

export const useSettingsData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { lang }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useSettingsData)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
  const description = copy.protectedDescription.replace('{{label}}', copy.navSettings)

  return {
    title: `${copy.navSettings} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  const data = useSettingsData()
  const copy = useLangCopy()
  const logoutBusy = useSignal(false)
  const logoutMessage = useSignal<string | null>(null)
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navSettings)

  const handleLogout = $(async () => {
    if (logoutBusy.value || typeof window === 'undefined') return
    logoutBusy.value = true
    logoutMessage.value = null
    try {
      const origin = window.location.origin
      const response = await fetch(buildApiUrl('/auth/sign-out', origin, appConfig.apiBase), {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        logoutMessage.value = 'Unable to sign out.'
        return
      }

      window.location.assign('/')
    } catch (error) {
      logoutMessage.value = error instanceof Error ? error.message : 'Unable to sign out.'
    } finally {
      logoutBusy.value = false
    }
  })

  return (
    <StaticRouteTemplate
      metaLine={copy.value.protectedMetaLine}
      title={copy.value.navSettings}
      description={description}
      actionLabel={copy.value.authLogoutLabel}
      actionDisabled={logoutBusy.value}
      onAction$={handleLogout}
      closeLabel={copy.value.fragmentClose}
    >
      {logoutMessage.value ? (
        <div class="auth-status" role="status" aria-live="polite" data-tone="error">
          {logoutMessage.value}
        </div>
      ) : null}
    </StaticRouteTemplate>
  )
})

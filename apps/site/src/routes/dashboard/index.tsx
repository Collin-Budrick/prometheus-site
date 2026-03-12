import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { useLangCopy, useLanguageSeed } from '../../shared/lang-bridge'
import { createCacheHandler, PRIVATE_REVALIDATE_CACHE } from '../cache-headers'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'
import { dashboardLanguageSelection, type LanguageSeedPayload } from '../../lang/selection'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { createStaticIslandRouteData } from '../../static-shell/island-static-data'
import { STATIC_ISLAND_DATA_SCRIPT_ID } from '../../static-shell/constants'
import { isStaticShellBuild } from '../../static-shell/build-mode'

type ProtectedRouteData = {
  lang: Lang
  languageSeed: LanguageSeedPayload
}

export const useDashboardData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const lang = resolveRequestLang(request)
  if (isStaticShellBuild()) {
    return { lang, languageSeed: createServerLanguageSeed(lang, dashboardLanguageSelection) }
  }
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { lang, languageSeed: createServerLanguageSeed(lang, dashboardLanguageSelection) }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_REVALIDATE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useDashboardData)
  const lang = data?.lang ?? defaultLang
  const copy = data?.languageSeed.ui
  const description = copy.protectedDescription.replace('{{label}}', copy.navDashboard)

  return {
    title: `${copy.navDashboard} | ${siteBrand.name}`,
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
  const data = useDashboardData()
  useLanguageSeed(data.value.lang, data.value.languageSeed)
  const copy = useLangCopy()
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navDashboard)

  return (
    <StaticPageRoot
      routeDataScriptId={STATIC_ISLAND_DATA_SCRIPT_ID}
      routeData={createStaticIslandRouteData('/dashboard', data.value.lang, 'dashboard')}
    >
      <StaticRouteTemplate
        metaLine={copy.value.protectedMetaLine}
        title={copy.value.navDashboard}
        description={description}
        actionLabel={copy.value.protectedAction}
        closeLabel={copy.value.fragmentClose}
      />
    </StaticPageRoot>
  )
})

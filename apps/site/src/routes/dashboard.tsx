import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../site-config'
import {
  createProtectedFeatureRouteHandler,
  ensureFeatureEnabled,
  PRIVATE_REVALIDATE_CACHE
} from './route-utils'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../shared/lang-bridge'
import { resolveRequestLang } from './fragment-resource'
import { defaultLang, type Lang } from '../shared/lang-store'
import { dashboardLanguageSelection, emptyUiCopy, type LanguageSeedPayload } from '../lang/selection'
import { StaticPageRoot } from '../shell/core/StaticPageRoot'
import { createStaticIslandRouteData } from '../shell/core/island-static-data'
import { STATIC_ISLAND_DATA_SCRIPT_ID } from '../shell/core/constants'
import { isStaticShellBuild } from '../shell/core/build-mode'
import { buildGlobalStylesheetLinks } from '../shell/core/global-style-assets'

type ProtectedRouteData = {
  lang: Lang
  languageSeed: LanguageSeedPayload
}

export const useDashboardData = routeLoader$<ProtectedRouteData>(async ({ request }) => {
  ensureFeatureEnabled('account')
  const { createServerLanguageSeed } = await import('../lang/server')
  const lang = resolveRequestLang(request)
  if (isStaticShellBuild()) {
    return { lang, languageSeed: createServerLanguageSeed(lang, dashboardLanguageSelection) }
  }
  return { lang, languageSeed: createServerLanguageSeed(lang, dashboardLanguageSelection) }
})

export const onGet: RequestHandler = createProtectedFeatureRouteHandler('account', PRIVATE_REVALIDATE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useDashboardData)
  const lang = data?.lang ?? defaultLang
  const copy = { ...emptyUiCopy, ...(data?.languageSeed.ui ?? {}) }
  const description = copy.protectedDescription.replace('{{label}}', copy.navDashboard)

  return {
    title: `${copy.navDashboard} | ${siteBrand.name}`,
    meta: [
      {
        name: 'description',
        content: description
      }
    ],
    links: buildGlobalStylesheetLinks(),
    htmlAttributes: {
      lang
    }
  }
}

export default component$(() => {
  const data = useDashboardData()
  useLanguageSeed(data.value.lang, data.value.languageSeed)
  const copy = useLangCopy(useSharedLangSignal(data.value.lang))
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

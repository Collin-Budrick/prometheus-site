import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'

type ProtectedRouteData = {
  lang: Lang
}

export const useDashboardData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { lang }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useDashboardData)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
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
  const copy = useLangCopy()
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navDashboard)

  return (
    <StaticRouteTemplate
      metaLine={copy.value.protectedMetaLine}
      title={copy.value.navDashboard}
      description={description}
      actionLabel={copy.value.protectedAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { defaultLang } from '../../shared/lang-store'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { resolveRequestLang } from '../fragment-resource'

type OfflineRouteData = {
  lang: string
}

export const useOfflineRoute = routeLoader$<OfflineRouteData>(({ request }) => ({
  lang: resolveRequestLang(request)
}))

export default component$(() => (
  <StaticPageRoot>
    <StaticRouteTemplate
      metaLine="offline mode"
      title="You are offline"
      description="The shell is available, but live fragments need connectivity."
      actionLabel="Refresh when online"
      closeLabel="Close"
    />
  </StaticPageRoot>
))

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => ({
  title: `${siteBrand.name} | Offline`,
  meta: [
    {
      name: 'robots',
      content: 'noindex'
    }
  ],
  htmlAttributes: {
    lang: resolveValue(useOfflineRoute)?.lang ?? defaultLang
  }
})

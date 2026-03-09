import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { type FragmentPlanValue } from '../../fragment/types'
import { buildOfflineShellFragment, offlineShellFragmentId } from '../home'
import { siteBrand } from '../../config'
import { defaultLang } from '../../shared/lang-store'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'
import { StaticFragmentRoute } from '../../static-shell/StaticFragmentRoute'
import { buildStaticFragmentRouteModel } from '../../static-shell/static-fragment-model'

const offlinePath = '/offline/'
const offlinePlan: FragmentPlanValue = {
  path: offlinePath,
  createdAt: 0,
  fragments: [
    {
      id: offlineShellFragmentId,
      critical: true,
      layout: { column: 'span 12' }
    }
  ]
}

const offlineRoute = buildStaticFragmentRouteModel({
  plan: offlinePlan,
  fragments: {
  [offlineShellFragmentId]: buildOfflineShellFragment(offlineShellFragmentId, offlinePath)
  },
  lang: defaultLang
})

export default component$(() => (
  <StaticFragmentRoute model={offlineRoute} />
))

export const head: DocumentHead = () => ({
  title: `${siteBrand.name} | Offline`,
  meta: [
    {
      name: 'robots',
      content: 'noindex'
    }
  ],
  links: buildFragmentCssLinks(offlinePlan),
  htmlAttributes: {
    lang: defaultLang
  }
})

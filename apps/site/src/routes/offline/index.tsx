import { component$ } from '@builder.io/qwik'
import type { DocumentHead } from '@builder.io/qwik-city'
import { FragmentShell } from '../../fragment/ui'
import { type FragmentPlanValue, type FragmentPayloadValue } from '../../fragment/types'
import { buildOfflineShellFragment, offlineShellFragmentId } from '../home'
import { siteBrand } from '../../config'
import { defaultLang } from '../../shared/lang-store'
import { buildFragmentCssLinks } from '../../fragment/fragment-css'

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

const offlineFragments: FragmentPayloadValue = {
  [offlineShellFragmentId]: buildOfflineShellFragment(offlineShellFragmentId, offlinePath)
}

export default component$(() => (
  <FragmentShell plan={offlinePlan} initialFragments={offlineFragments} path={offlinePath} initialLang={defaultLang} />
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

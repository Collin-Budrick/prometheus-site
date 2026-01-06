import { component$ } from '@builder.io/qwik'
import { routeLoader$ } from '@builder.io/qwik-city'
import { FragmentShell } from '../../../web/src/features/fragments'
import type { FragmentPayloadValue, FragmentPlanValue } from '../../../web/src/fragment/types'
import LabRoute, { LabSkeleton, head, onGet } from '@features/lab/pages/Lab'
import { appConfig } from '../app-config'
import { loadHybridFragmentResource, resolveRequestLang } from './fragment-resource'
import type { Lang } from '../shared/lang-store'

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
}

export const useFragmentResource = routeLoader$<FragmentResource | null>(async ({ url, request }) => {
  const path = url.pathname || '/lab'
  const lang = resolveRequestLang(request)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for lab', error)
    return null
  }
})

export { LabSkeleton, head, onGet }
export { LabSkeleton as skeleton }

export default component$(() => {
  const fragmentResource = useFragmentResource()
  const data = fragmentResource.value
  if (data?.plan?.fragments?.length) {
    return (
      <FragmentShell
        plan={data.plan}
        initialFragments={data.fragments}
        path={data.path}
        initialLang={data.lang}
      />
    )
  }
  return <LabRoute />
})

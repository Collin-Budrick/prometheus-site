import { component$ } from '@builder.io/qwik'
import { routeLoader$, type DocumentHead, type DocumentHeadProps } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { StaticPageRoot } from '../../static-shell/StaticPageRoot'
import { resolveRequestLang } from '../fragment-resource'
import { useLangCopy, useLanguageSeed, useSharedLangSignal } from '../../shared/lang-bridge'
import { offlineLanguageSelection, type LanguageSeedPayload } from '../../lang/selection'

type OfflineRouteData = {
  lang: Lang
  languageSeed: LanguageSeedPayload
}

export const useOfflineRoute = routeLoader$<OfflineRouteData>(async ({ request }) => {
  const { createServerLanguageSeed } = await import('../../lang/server')
  const lang = resolveRequestLang(request)
  return {
    lang,
    languageSeed: createServerLanguageSeed(lang, offlineLanguageSelection)
  }
})

export default component$(() => {
  const data = useOfflineRoute()
  useLanguageSeed(data.value.lang, data.value.languageSeed)
  const copy = useLangCopy(useSharedLangSignal(data.value.lang))

  return (
    <StaticPageRoot>
      <StaticRouteTemplate
        metaLine={copy.value.networkOfflineTitle}
        title={copy.value.networkOfflineTitle}
        description={copy.value.networkOfflineHint}
        actionLabel={copy.value.networkRetrySync}
        closeLabel={copy.value.fragmentClose}
      />
    </StaticPageRoot>
  )
})

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useOfflineRoute)
  const lang = data?.lang ?? defaultLang
  const copy = data?.languageSeed.ui

  return {
    title: `${siteBrand.name} | ${copy?.networkOfflineTitle ?? 'Offline'}`,
    meta: [
      {
        name: 'robots',
        content: 'noindex'
      },
      {
        name: 'description',
        content: copy?.networkOfflineHint ?? ''
      }
    ],
    htmlAttributes: {
      lang
    }
  }
}

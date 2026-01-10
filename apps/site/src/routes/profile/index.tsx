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

type ProfileData = {
  user: {
    id?: string
    name?: string
    email?: string
    image?: string
  }
  lang: Lang
}

export const useProfileData = routeLoader$<ProfileData>(async ({ request, redirect }) => {
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { user: session.user, lang }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useProfileData)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
  const description = copy.protectedDescription.replace('{{label}}', copy.navProfile)

  return {
    title: `${copy.navProfile} | ${siteBrand.name}`,
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
  const data = useProfileData()
  const copy = useLangCopy()
  const user = data.value.user
  const nameValue = user.name ?? user.email ?? user.id
  const emailValue = user.email ?? user.id
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navProfile)

  return (
    <StaticRouteTemplate
      metaLine={copy.value.protectedMetaLine}
      title={copy.value.navProfile}
      description={description}
      actionLabel={copy.value.protectedAction}
      closeLabel={copy.value.fragmentClose}
    >
      <div class="profile-details">
        {nameValue ? (
          <div class="profile-row">
            <span>{copy.value.authNameLabel}</span>
            <strong>{nameValue}</strong>
          </div>
        ) : null}
        {emailValue ? (
          <div class="profile-row">
            <span>{copy.value.authEmailLabel}</span>
            <strong>{emailValue}</strong>
          </div>
        ) : null}
      </div>
    </StaticRouteTemplate>
  )
})

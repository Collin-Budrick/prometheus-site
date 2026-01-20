import { component$, useContextProvider } from '@builder.io/qwik'
import { routeLoader$, useLocation, type DocumentHead, type DocumentHeadProps, type RequestHandler } from '@builder.io/qwik-city'
import { StaticRouteTemplate } from '@prometheus/ui'
import { siteBrand } from '../../config'
import { useLangCopy } from '../../shared/lang-bridge'
import { getUiCopy } from '../../shared/ui-copy'
import { createCacheHandler, PRIVATE_NO_STORE_CACHE } from '../cache-headers'
import { loadHybridFragmentResource, resolveRequestLang } from '../fragment-resource'
import { defaultLang, type Lang } from '../../shared/lang-store'
import { loadAuthSession } from '../../shared/auth-session'
import { resolveRequestOrigin, resolveServerApiBase } from '../../shared/api-base'
import {
  FragmentShell,
  getFragmentShellCacheEntry,
  readFragmentShellStateFromCookie,
  type FragmentShellState
} from '../../fragment/ui'
import type { FragmentPayloadValue, FragmentPlanValue } from '../../fragment/types'
import { ContactInvitesSeedContext, type ContactInvitesSeed } from '../../shared/contact-invites-seed'
import { normalizeInviteGroups } from '../../components/contact-invites/data'
import { appConfig } from '../../app-config'

type ProtectedRouteData = {
  lang: Lang
}

export const useChatData = routeLoader$<ProtectedRouteData>(async ({ request, redirect }) => {
  const lang = resolveRequestLang(request)
  const session = await loadAuthSession(request)
  if (session.status !== 'authenticated') {
    throw redirect(302, '/login')
  }
  return { lang }
})

type FragmentResource = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  path: string
  lang: Lang
  shellState: FragmentShellState | null
  contactInvitesSeed: ContactInvitesSeed | null
}

const resolveChatApiBase = (request: Request) => {
  const apiBase = resolveServerApiBase(appConfig.apiBase, request)
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) return apiBase
  const origin = resolveRequestOrigin(request)
  if (!origin) return ''
  if (apiBase.startsWith('/')) return `${origin}${apiBase}`
  return `${origin}/${apiBase}`
}

const buildChatApiUrl = (apiBase: string, path: string) => {
  if (!apiBase) return ''
  const trimmed = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${trimmed}${suffix}`
}

const loadContactInvitesSeed = async (request: Request): Promise<ContactInvitesSeed | null> => {
  const apiBase = resolveChatApiBase(request)
  const url = buildChatApiUrl(apiBase, '/chat/contacts/invites')
  if (!url) return null
  const cookieHeader = request.headers.get('cookie')
  const headers: HeadersInit = { accept: 'application/json' }
  if (cookieHeader) headers.cookie = cookieHeader

  try {
    const response = await fetch(url, { headers })
    if (!response.ok) return null
    const payload = await response.json()
    return { invites: normalizeInviteGroups(payload) }
  } catch (error) {
    console.warn('Failed to seed contact invites', error)
    return null
  }
}

export const useFragmentResource = routeLoader$<FragmentResource | null>(async ({ url, request }) => {
  const path = url.pathname || '/chat'
  const lang = resolveRequestLang(request)
  const contactInvitesSeed = await loadContactInvitesSeed(request)

  try {
    const { plan, fragments, path: planPath } = await loadHybridFragmentResource(path, appConfig, lang, request)
    return {
      plan,
      fragments: fragments as FragmentPayloadValue,
      path: planPath,
      lang,
      shellState: readFragmentShellStateFromCookie(request.headers.get('cookie'), planPath),
      contactInvitesSeed
    }
  } catch (error) {
    console.error('Fragment plan fetch failed for chat', error)
    return null
  }
})

export const onGet: RequestHandler = createCacheHandler(PRIVATE_NO_STORE_CACHE)

export const head: DocumentHead = ({ resolveValue }: DocumentHeadProps) => {
  const data = resolveValue(useChatData)
  const lang = data?.lang ?? defaultLang
  const copy = getUiCopy(lang)
  const description = copy.protectedDescription.replace('{{label}}', copy.navChat)

  return {
    title: `${copy.navChat} | ${siteBrand.name}`,
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
  const location = useLocation()
  const data = useChatData()
  const fragmentResource = useFragmentResource()
  const cachedEntry = typeof window !== 'undefined' ? getFragmentShellCacheEntry(location.url.pathname) : undefined
  const cachedData = cachedEntry
    ? {
        plan: cachedEntry.plan,
        fragments: cachedEntry.fragments,
        path: cachedEntry.path,
        lang: cachedEntry.lang,
        shellState: null,
        contactInvitesSeed: null
      }
    : null
  const fragmentData = fragmentResource.value ?? cachedData
  const copy = useLangCopy()
  void data.value
  const description = copy.value.protectedDescription.replace('{{label}}', copy.value.navChat)
  useContextProvider(ContactInvitesSeedContext, fragmentData?.contactInvitesSeed ?? null)

  if (fragmentData?.plan?.fragments?.length) {
    return (
      <FragmentShell
        plan={fragmentData.plan}
        initialFragments={fragmentData.fragments}
        path={fragmentData.path}
        initialLang={fragmentData.lang}
        initialShellState={fragmentData.shellState ?? undefined}
      />
    )
  }

  return (
    <StaticRouteTemplate
      metaLine={copy.value.protectedMetaLine}
      title={copy.value.navChat}
      description={description}
      actionLabel={copy.value.protectedAction}
      closeLabel={copy.value.fragmentClose}
    />
  )
})

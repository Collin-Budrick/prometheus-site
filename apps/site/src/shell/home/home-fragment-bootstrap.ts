import { getPublicFragmentApiBase } from '../../shared/public-fragment-config'

export const HOME_FRAGMENT_BOOTSTRAP_IDS = [
  'fragment://page/home/planner@v1',
  'fragment://page/home/ledger@v1',
  'fragment://page/home/island@v1',
  'fragment://page/home/react@v1'
] as const

export const HOME_FRAGMENT_BOOTSTRAP_STATE_KEY = '__PROM_STATIC_HOME_FRAGMENT_BOOTSTRAP__'
const HOME_FRAGMENT_BOOTSTRAP_ID_SET = new Set<string>(HOME_FRAGMENT_BOOTSTRAP_IDS)

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type HomeFragmentBootstrapWindowState = {
  href: string
  bytesPromise: Promise<Uint8Array>
}

export type HomeFragmentBootstrapWindow = Window & {
  [HOME_FRAGMENT_BOOTSTRAP_STATE_KEY]?: HomeFragmentBootstrapWindowState
}

export type HomeFragmentBootstrapPreloadLink = {
  rel: 'preload'
  as: 'fetch'
  href: string
  crossorigin: 'anonymous'
  'data-home-fragment-bootstrap': 'true'
}

const dedupeFragmentIds = (ids: readonly string[]) => {
  const unique: string[] = []
  const seen = new Set<string>()

  ids.forEach((id) => {
    const normalized = id.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    unique.push(normalized)
  })

  return unique
}

const resolveHomeFragmentBootstrapUrl = (href: string) => {
  const base =
    typeof window !== 'undefined' && typeof window.location?.origin === 'string'
      ? window.location.origin
      : 'https://prometheus.local'
  return new URL(href, base)
}

const parseHomeFragmentBootstrapSelection = (href: string) => {
  try {
    const url = resolveHomeFragmentBootstrapUrl(href)
    return {
      origin: url.origin,
      pathname: url.pathname,
      protocol: url.searchParams.get('protocol') ?? '',
      lang: url.searchParams.get('lang') ?? '',
      ids: dedupeFragmentIds((url.searchParams.get('ids') ?? '').split(','))
    }
  } catch {
    return null
  }
}

const matchesPrimedHomeFragmentBootstrapSelection = (
  requestedHref: string,
  primedHref: string
) => {
  if (requestedHref === primedHref) {
    return true
  }

  const requested = parseHomeFragmentBootstrapSelection(requestedHref)
  const primed = parseHomeFragmentBootstrapSelection(primedHref)
  if (!requested || !primed) {
    return false
  }

  if (
    requested.origin !== primed.origin ||
    requested.pathname !== primed.pathname ||
    requested.protocol !== primed.protocol ||
    requested.lang !== primed.lang
  ) {
    return false
  }

  return requested.ids.length > 0 && requested.ids.every((id) => primed.ids.includes(id))
}

export const fetchHomeFragmentBootstrapBytes = async ({
  href,
  fetcher = fetch as FetchLike,
  cache = 'default',
  signal
}: {
  href: string
  fetcher?: FetchLike
  cache?: RequestCache
  signal?: AbortSignal
}) => {
  const response = await fetcher(href, {
    cache,
    credentials: 'same-origin',
    mode: 'cors',
    signal
  })
  if (!response.ok) {
    throw new Error(`Home fragment bootstrap fetch failed: ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

export const isHomeFragmentBootstrapSubset = (ids: readonly string[]) => {
  const normalizedIds = dedupeFragmentIds(ids)
  return normalizedIds.length > 0 && normalizedIds.every((id) => HOME_FRAGMENT_BOOTSTRAP_ID_SET.has(id))
}

export const buildHomeFragmentBootstrapHref = ({
  lang,
  ids = HOME_FRAGMENT_BOOTSTRAP_IDS,
  apiBase = getPublicFragmentApiBase()
}: {
  lang?: string
  ids?: readonly string[]
  apiBase?: string
} = {}) => {
  const params = new URLSearchParams({
    protocol: '2',
    ids: dedupeFragmentIds(ids).join(',')
  })
  if (lang) {
    params.set('lang', lang)
  }
  return `${apiBase}/fragments/bootstrap?${params.toString()}`
}

export const buildHomeFragmentBootstrapPreloadLink = (
  lang?: string
): HomeFragmentBootstrapPreloadLink => ({
  rel: 'preload',
  as: 'fetch',
  href: buildHomeFragmentBootstrapHref({ lang }),
  crossorigin: 'anonymous',
  'data-home-fragment-bootstrap': 'true'
})

export const buildHomeFragmentBootstrapEarlyHint = (lang?: string) => ({
  href: buildHomeFragmentBootstrapHref({ lang }),
  as: 'fetch' as const,
  crossorigin: 'anonymous' as const
})

export const buildPrimeHomeFragmentBootstrapScript = (href: string) => {
  const escapedHref = JSON.stringify(href)
  const escapedKey = JSON.stringify(HOME_FRAGMENT_BOOTSTRAP_STATE_KEY)

  return `(function(){var win=window;if(!win)return;var href=${escapedHref};var key=${escapedKey};var existing=win[key];if(existing&&existing.href===href)return;var bytesPromise=fetch(href,{cache:"default",credentials:"same-origin",mode:"cors"}).then(function(response){if(!response.ok)throw new Error("Home fragment bootstrap fetch failed: "+response.status);return response.arrayBuffer();}).then(function(buffer){return new Uint8Array(buffer);}).catch(function(error){if(win[key]&&win[key].href===href){delete win[key];}throw error;});win[key]={href:href,bytesPromise:bytesPromise};})();`
}

export const primeHomeFragmentBootstrapBytes = ({
  href,
  win = typeof window !== 'undefined' ? (window as HomeFragmentBootstrapWindow) : null,
  fetcher = fetch as FetchLike
}: {
  href: string
  win?: HomeFragmentBootstrapWindow | null
  fetcher?: FetchLike
}) => {
  const existing = win?.[HOME_FRAGMENT_BOOTSTRAP_STATE_KEY]
  if (existing?.href === href) {
    return existing.bytesPromise
  }

  const bytesPromise = fetchHomeFragmentBootstrapBytes({ href, fetcher, cache: 'default' }).catch((error) => {
    if (win?.[HOME_FRAGMENT_BOOTSTRAP_STATE_KEY]?.href === href) {
      delete win[HOME_FRAGMENT_BOOTSTRAP_STATE_KEY]
    }
    throw error
  })

  if (win) {
    win[HOME_FRAGMENT_BOOTSTRAP_STATE_KEY] = { href, bytesPromise }
  }

  return bytesPromise
}

export const readPrimedHomeFragmentBootstrapBytes = ({
  href,
  win = typeof window !== 'undefined' ? (window as HomeFragmentBootstrapWindow) : null
}: {
  href: string
  win?: HomeFragmentBootstrapWindow | null
}) => {
  const existing = win?.[HOME_FRAGMENT_BOOTSTRAP_STATE_KEY]
  return existing && matchesPrimedHomeFragmentBootstrapSelection(href, existing.href)
    ? existing.bytesPromise
    : null
}

export const consumePrimedHomeFragmentBootstrapBytes = ({
  href,
  win = typeof window !== 'undefined' ? (window as HomeFragmentBootstrapWindow) : null
}: {
  href: string
  win?: HomeFragmentBootstrapWindow | null
}) => {
  return readPrimedHomeFragmentBootstrapBytes({ href, win })
}

export const resetHomeFragmentBootstrapStateForTests = (win?: HomeFragmentBootstrapWindow | null) => {
  const target = win ?? (typeof window !== 'undefined' ? (window as HomeFragmentBootstrapWindow) : null)
  if (!target) return
  delete target[HOME_FRAGMENT_BOOTSTRAP_STATE_KEY]
}

import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import { extractBase, setSsrLocaleGetter } from 'compiled-i18n/qwik'
import qwikCityPlan from '@qwik-city-plan'
import Root from './root'
import { resolveLocale } from './i18n/locale'

// cspell:ignore qwikloader

setSsrLocaleGetter()

const resolveBase = (opts: RenderToStreamOptions) => {
  const base = typeof opts.base === 'function' ? opts.base(opts) : opts.base
  if (!base) return '/build/'
  return base.endsWith('/') ? base : `${base}/`
}

const normalizeLocaleBuildBase = (base: string, locale: string) => {
  const suffix = `/build/${locale}/`
  if (!base.endsWith(suffix)) return base
  return `${base.slice(0, -suffix.length)}/build/`
}

const isManifestWrapper = (value: unknown): value is { manifest: unknown } & Record<string, unknown> => {
  return !!value && typeof value === 'object' && 'manifest' in value
}

const resolveLocaleFromRequest = (opts: RenderToStreamOptions) => {
  const knownLocale = opts.serverData?.locale
  if (knownLocale) return knownLocale

  let queryLocale: string | null = null
  const url = opts.serverData?.url
  if (url) {
    try {
      queryLocale = new URL(url).searchParams.get('locale')
    } catch {
      queryLocale = null
    }
  }

  const acceptLanguage =
    (opts.serverData?.requestHeaders as Record<string, string> | undefined)?.['accept-language'] ?? undefined

  return resolveLocale({ queryLocale, acceptLanguage })
}

const resolvePathname = (opts: RenderToStreamOptions) => {
  const url = opts.serverData?.url
  if (typeof url === 'string' && url.length > 0) {
    try {
      return new URL(url).pathname
    } catch {}
  }

  return '/'
}

const resolveIsAudit = (opts: RenderToStreamOptions) => {
  const url = opts.serverData?.url
  if (typeof url === 'string' && url.length > 0) {
    try {
      const parsed = new URL(url)
      const audit = parsed.searchParams.get('audit')
      if (audit === '1' || audit === 'true') return true
    } catch {}
  }

  return false
}

const shouldInjectModulePreloads = (pathname: string, isAudit: boolean) => {
  if (isAudit) return false
  return pathname !== '/' && pathname !== '/index'
}

const resolveRouteBundles = (pathname: string): string[] => {
  const routes = (qwikCityPlan as { routes?: unknown }).routes
  if (!Array.isArray(routes)) return []

  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  const homeCandidates = new Set(['/', '/index'])

  for (const route of routes) {
    if (!Array.isArray(route) || route.length < 4) continue
    const routePath = route[2]
    const bundles = route[3]
    if (typeof routePath !== 'string' || !Array.isArray(bundles)) continue

    if (homeCandidates.has(routePath) && homeCandidates.has(normalized)) {
      return bundles.filter((bundle): bundle is string => typeof bundle === 'string' && bundle.length > 0)
    }

    if (routePath === normalized) {
      return bundles.filter((bundle): bundle is string => typeof bundle === 'string' && bundle.length > 0)
    }
  }

  return []
}

const resolveModulePreloads = (base: string, resolvedManifest: unknown, pathname: string) => {
  const manifestRecord = resolvedManifest && typeof resolvedManifest === 'object' ? (resolvedManifest as Record<string, unknown>) : null
  const qwikLoader = typeof manifestRecord?.qwikLoader === 'string' ? manifestRecord.qwikLoader : null
  const core = typeof manifestRecord?.core === 'string' ? manifestRecord.core : null

  const bundles = resolveRouteBundles(pathname)
  const candidates = [qwikLoader, core, ...bundles].filter((value): value is string => typeof value === 'string')

  const seen = new Set<string>()
  return candidates
    .filter((file) => {
      if (seen.has(file)) return false
      seen.add(file)
      return true
    })
    .map((file) => ({
      tag: 'link' as const,
      location: 'head' as const,
      attributes: {
        rel: 'modulepreload',
        href: `${base}${file}`,
        crossorigin: 'anonymous',
        fetchpriority: 'low'
      }
    }))
}

export default function render(opts: RenderToStreamOptions) {
  const isProd = import.meta.env.PROD
  const clientManifest = opts.manifest ?? manifest
  const resolvedManifest = isManifestWrapper(clientManifest) ? clientManifest.manifest : clientManifest
  const pathname = resolvePathname(opts)
  const isAudit = resolveIsAudit(opts)
  const locale = resolveLocaleFromRequest(opts)
  const serverData = { ...opts.serverData, locale }
  const baseFromI18n = resolveBase({ ...opts, base: extractBase, serverData })
  const base = normalizeLocaleBuildBase(baseFromI18n, locale)
  const loaderFile = (resolvedManifest as { qwikLoader?: string } | undefined)?.qwikLoader ?? 'qwikloader.js'
  const loaderSrc = `${base}${loaderFile}`
  const containerAttributes = {
    ...opts.containerAttributes,
    lang: locale,
    'q:locale': locale
  }

  const lazyLoaderScript =
    `(function(){const src='${loaderSrc}';if(!src)return;let started=false;` +
    `const load=()=>{if(started||navigator.connection?.saveData)return;started=true;const s=document.createElement('script');s.type='module';s.defer=true;s.src=src;s.setAttribute('data-qwik-loader','lazy');document.head.appendChild(s);};` +
    `const prime=()=>{load();cleanup();};` +
    `const cleanup=()=>triggers.forEach((event)=>document.removeEventListener(event,prime,listenerOpts));` +
    `const triggers=['pointerdown','keydown','touchstart','focusin'];` +
    `const listenerOpts={once:true,passive:true};` +
    `triggers.forEach((event)=>document.addEventListener(event,prime,listenerOpts));` +
    `document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')prime();},{once:true});})();`

  const lazyInjection = {
    tag: 'script' as const,
    location: 'head' as const,
    attributes: {
      'data-qwik-lazy-loader': '1',
      dangerouslySetInnerHTML: lazyLoaderScript
    }
  }

  const modulePreloadInjections =
    isProd && shouldInjectModulePreloads(pathname, isAudit) ? resolveModulePreloads(base, resolvedManifest, pathname) : []

  const manifestWithLazyLoader = (
    isProd && resolvedManifest
      ? isManifestWrapper(clientManifest)
        ? {
            ...clientManifest,
            manifest: {
              ...(resolvedManifest as Record<string, unknown>),
              core: undefined,
              preloader: undefined,
              injections: ([...(resolvedManifest as any)?.injections ?? [], ...modulePreloadInjections, lazyInjection] as any)
            }
          }
        : {
            ...(resolvedManifest as Record<string, unknown>),
            core: undefined,
            preloader: undefined,
            injections: ([...(resolvedManifest as any)?.injections ?? [], ...modulePreloadInjections, lazyInjection] as any)
          }
      : clientManifest
  ) as RenderToStreamOptions['manifest']

  return renderToStream(<Root />, {
    ...opts,
    base,
    serverData,
    manifest: manifestWithLazyLoader,
    qwikLoader: isProd ? 'never' : opts.qwikLoader,
    preloader: isProd ? false : opts.preloader,
    containerTagName: 'html',
    containerAttributes,
    stream:
      opts.stream ??
      {
        static: {
          buffer: 0
        },
        inOrder: ['<html']
      }
  })
}

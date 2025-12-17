import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import { extractBase, setSsrLocaleGetter } from 'compiled-i18n/qwik'
import Root from './root'
import { resolveLocale } from './i18n/locale'

// cspell:ignore qwikloader

setSsrLocaleGetter()

const resolveBase = (opts: RenderToStreamOptions) => {
  const base = typeof opts.base === 'function' ? opts.base(opts) : opts.base
  if (!base) return '/build/'
  return base.endsWith('/') ? base : `${base}/`
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

export default function render(opts: RenderToStreamOptions) {
  const isProd = import.meta.env.PROD
  const clientManifest = opts.manifest ?? manifest
  const resolvedManifest = isManifestWrapper(clientManifest) ? clientManifest.manifest : clientManifest
  const locale = resolveLocaleFromRequest(opts)
  const serverData = { ...opts.serverData, locale }
  const base = resolveBase({ ...opts, base: extractBase, serverData })
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

  const manifestWithLazyLoader = (
    isProd && resolvedManifest
      ? isManifestWrapper(clientManifest)
        ? {
            ...clientManifest,
            manifest: {
              ...(resolvedManifest as Record<string, unknown>),
              core: undefined,
              preloader: undefined,
              injections: ([...(resolvedManifest as any)?.injections ?? [], lazyInjection] as any)
            }
          }
        : {
            ...(resolvedManifest as Record<string, unknown>),
            core: undefined,
            preloader: undefined,
            injections: ([...(resolvedManifest as any)?.injections ?? [], lazyInjection] as any)
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

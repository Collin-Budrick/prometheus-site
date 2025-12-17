import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import Root from './root'

// cspell:ignore qwikloader

const resolveBase = (opts: RenderToStreamOptions) => {
  const base = typeof opts.base === 'function' ? opts.base(opts) : opts.base
  if (!base) return '/build/'
  return base.endsWith('/') ? base : `${base}/`
}

const isManifestWrapper = (value: unknown): value is { manifest: unknown } & Record<string, unknown> => {
  return !!value && typeof value === 'object' && 'manifest' in value
}

export default function render(opts: RenderToStreamOptions) {
  const isProd = import.meta.env.PROD
  const clientManifest = opts.manifest ?? manifest
  const resolvedManifest = isManifestWrapper(clientManifest) ? clientManifest.manifest : clientManifest
  const base = resolveBase(opts)
  const loaderFile = (resolvedManifest as { qwikLoader?: string } | undefined)?.qwikLoader ?? 'qwikloader.js'
  const loaderSrc = `${base}${loaderFile}`
  const containerAttributes = opts.containerAttributes
    ? { lang: 'en', ...opts.containerAttributes }
    : { lang: 'en' }

  const lazyLoaderScript =
    `(function(){const src='${loaderSrc}';if(!src)return;let started=false;` +
    `const load=()=>{if(started)return;started=true;const s=document.createElement('script');s.type='module';s.defer=true;s.src=src;s.setAttribute('data-qwik-loader','lazy');document.head.appendChild(s);};` +
    `const kickIdle=()=>{if(started)return;if('requestIdleCallback'in window){requestIdleCallback(load,{timeout:1500});}else{setTimeout(load,1500);}};` +
    `['pointerdown','keydown','touchstart','focusin'].forEach((event)=>document.addEventListener(event,load,{once:true,passive:true}));` +
    `if(document.readyState==='complete'){kickIdle();}else{window.addEventListener('load',kickIdle,{once:true});}})();`

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

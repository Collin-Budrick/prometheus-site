import type { RequestEvent } from '@builder.io/qwik-city'
import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import { PUBLIC_CACHE_CONTROL } from './cache-control'
import Root from './root'

export default function (opts: RenderToStreamOptions) {
  const lang = opts.containerAttributes?.lang ?? opts.serverData?.locale ?? 'en'
  const requestEv = opts.serverData?.qwikcity?.ev as RequestEvent | undefined
  const preloader = opts.preloader ?? { ssrPreloads: 2, maxIdlePreloads: 8 }

  if (
    requestEv &&
    (requestEv.method === 'GET' || requestEv.method === 'HEAD') &&
    !requestEv.headers.has('Cache-Control')
  ) {
    requestEv.headers.set(
      'Cache-Control',
      PUBLIC_CACHE_CONTROL // 0s freshness, 60s stale-while-revalidate for shared/public caches.
    )
  }

  return renderToStream(<Root />, {
    manifest,
    ...opts,
    qwikLoader: opts.qwikLoader ?? 'inline',
    preloader,
    containerTagName: opts.containerTagName ?? 'html',
    containerAttributes: {
      ...opts.containerAttributes,
      lang
    }
  })
}

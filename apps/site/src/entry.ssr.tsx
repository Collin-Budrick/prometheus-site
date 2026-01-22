import type { RequestEvent } from '@builder.io/qwik-city'
import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import Root from './root'
import { readThemeFromCookie } from '@prometheus/ui'
import { readServiceWorkerSeedFromCookie } from './shared/service-worker-seed'

export default function (opts: RenderToStreamOptions) {
  const lang = opts.containerAttributes?.lang ?? opts.serverData?.locale ?? 'en'
  const requestEv = opts.serverData?.qwikcity?.ev as RequestEvent | undefined
  const cookieHeader = requestEv?.request.headers.get('cookie') ?? null
  const theme = requestEv ? readThemeFromCookie(cookieHeader) : null
  const swSeed = readServiceWorkerSeedFromCookie(cookieHeader)
  const disableSw = import.meta.env.VITE_DISABLE_SW === '1' || import.meta.env.VITE_DISABLE_SW === 'true'
  const containerAttributes: Record<string, string> = {
    ...opts.containerAttributes,
    lang
  }
  if (theme) {
    containerAttributes['data-theme'] = theme
  }
  containerAttributes['data-sw-disabled'] = disableSw ? '1' : '0'
  if (swSeed.cleanupVersion) {
    containerAttributes['data-sw-cleanup-version'] = swSeed.cleanupVersion
  }
  if (swSeed.forceCleanup !== undefined) {
    containerAttributes['data-sw-force-cleanup'] = swSeed.forceCleanup ? '1' : '0'
  }
  if (swSeed.optOut !== undefined) {
    containerAttributes['data-sw-opt-out'] = swSeed.optOut ? '1' : '0'
  }
  const preloader = opts.preloader ?? { ssrPreloads: 0, maxIdlePreloads: 2 }
  const qwikLoader = import.meta.env.PROD ? 'inline' : opts.qwikLoader ?? 'inline'

  return renderToStream(<Root />, {
    manifest,
    ...opts,
    qwikLoader,
    preloader,
    containerTagName: opts.containerTagName ?? 'html',
    containerAttributes
  })
}

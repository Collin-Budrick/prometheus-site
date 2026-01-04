import type { RequestEvent } from '@builder.io/qwik-city'
import { renderToStream } from '@builder.io/qwik/server'
import type { RenderToStreamOptions } from '@builder.io/qwik/server'
import { createQwikCity } from '@builder.io/qwik-city/middleware/node'
import { manifest } from '@qwik-client-manifest'
import qwikCityPlan from '@qwik-city-plan'
import Root from './root'
import { readThemeFromCookie } from './shared/theme-store'

export default createQwikCity({
  render: (opts: RenderToStreamOptions) => {
    const lang = opts.containerAttributes?.lang ?? opts.serverData?.locale ?? 'en'
    const requestEv = opts.serverData?.qwikcity?.ev as RequestEvent | undefined
    const theme = requestEv ? readThemeFromCookie(requestEv.request.headers.get('cookie')) : null
    const themeAttributes = theme ? { 'data-theme': theme } : {}
    const preloader = import.meta.env.PROD ? false : opts.preloader ?? { ssrPreloads: 2, maxIdlePreloads: 8 }
    const qwikLoader = import.meta.env.PROD ? 'inline' : opts.qwikLoader ?? 'inline'
    return renderToStream(<Root />, {
      manifest,
      ...opts,
      preloader,
      qwikLoader,
      containerTagName: opts.containerTagName ?? 'html',
      containerAttributes: {
        ...opts.containerAttributes,
        lang,
        'data-initial-fade': 'true',
        ...themeAttributes
      }
    })
  },
  manifest,
  qwikCityPlan
})

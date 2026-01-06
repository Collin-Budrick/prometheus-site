import type { RequestEvent } from '@builder.io/qwik-city'
import { renderToStream } from '@builder.io/qwik/server'
import type { RenderToStreamOptions } from '@builder.io/qwik/server'
import { createQwikCity } from '@builder.io/qwik-city/middleware/node'
import { manifest } from '@qwik-client-manifest'
import qwikCityPlan from '@qwik-city-plan'
import Root from './root'
import { readThemeFromCookie } from '@prometheus/ui'

export default createQwikCity({
  render: (opts: RenderToStreamOptions) => {
    const lang = opts.containerAttributes?.lang ?? opts.serverData?.locale ?? 'en'
    const requestEv = opts.serverData?.qwikcity?.ev as RequestEvent | undefined
    const theme = requestEv ? readThemeFromCookie(requestEv.request.headers.get('cookie')) : null
    const containerAttributes: Record<string, string> = {
      ...opts.containerAttributes,
      lang,
      'data-initial-fade': 'pending'
    }
    if (theme) {
      containerAttributes['data-theme'] = theme
    }
    const preloader = import.meta.env.PROD ? false : opts.preloader ?? { ssrPreloads: 2, maxIdlePreloads: 8 }
    const qwikLoader = import.meta.env.PROD ? 'inline' : opts.qwikLoader ?? 'inline'
    return renderToStream(<Root />, {
      manifest,
      ...opts,
      preloader,
      qwikLoader,
      containerTagName: opts.containerTagName ?? 'html',
      containerAttributes
    })
  },
  manifest,
  qwikCityPlan
})

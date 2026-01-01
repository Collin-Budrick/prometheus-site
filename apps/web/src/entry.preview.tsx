import { renderToStream } from '@builder.io/qwik/server'
import type { RenderToStreamOptions } from '@builder.io/qwik/server'
import { createQwikCity } from '@builder.io/qwik-city/middleware/node'
import { manifest } from '@qwik-client-manifest'
import qwikCityPlan from '@qwik-city-plan'
import Root from './root'

export default createQwikCity({
  render: (opts: RenderToStreamOptions) =>
    renderToStream(<Root />, { manifest, ...opts, qwikLoader: opts.qwikLoader ?? 'inline' }),
  manifest,
  qwikCityPlan
})

import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import Root from './root'

export default function (opts: RenderToStreamOptions) {
  const lang = opts.containerAttributes?.lang ?? opts.serverData?.locale ?? 'en'

  return renderToStream(<Root />, {
    manifest,
    ...opts,
    qwikLoader: opts.qwikLoader ?? 'inline',
    containerTagName: opts.containerTagName ?? 'html',
    containerAttributes: {
      ...opts.containerAttributes,
      lang
    }
  })
}

import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import Root from './root'

export default function render(opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    ...opts,
    manifest: opts.manifest ?? manifest,
    containerTagName: 'main',
    stream:
      opts.stream ??
      {
        static: {
          buffer: 0
        },
        inOrder: ['<main']
      }
  })
}

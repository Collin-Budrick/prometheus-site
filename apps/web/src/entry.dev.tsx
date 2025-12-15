import { render, type RenderOptions } from '@builder.io/qwik'
import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import Root from './root'

export default async function renderEntry(opts: RenderToStreamOptions | RenderOptions = {}) {
  if (typeof document !== 'undefined') {
    // Vite dev sometimes executes the dev entry in the browser; fall back to client render there.
    return render(document, <Root />, opts as RenderOptions)
  }

  return renderToStream(<Root />, {
    ...(opts as RenderToStreamOptions),
    containerTagName: 'main',
    stream:
      (opts as RenderToStreamOptions).stream ??
      {
        static: { buffer: 0 },
        inOrder: ['<main']
      }
  })
}

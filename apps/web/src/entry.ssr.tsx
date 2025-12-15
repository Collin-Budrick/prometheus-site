import { renderToStream } from '@builder.io/qwik/server'
import { manifest } from '@qwik-client-manifest'
import Root from './root'

export default renderToStream(<Root />, {
  manifest,
  containerTagName: 'main',
  stream: {
    static: {
      buffer: 0
    },
    inOrder: ['<main']
  }
})

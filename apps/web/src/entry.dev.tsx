import { renderToStream } from '@builder.io/qwik/server'
import Root from './root'

export default renderToStream(<Root />, {
  containerTagName: 'main'
})

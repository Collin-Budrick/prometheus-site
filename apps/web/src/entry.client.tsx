import { render } from '@builder.io/qwik'
import Root from './root'

if (import.meta.hot) {
  import.meta.hot.on('vite:connected', () => {
    console.info('[vite] connected (https proxy)')
  })
}

export default function () {
  render(document, <Root />)
}

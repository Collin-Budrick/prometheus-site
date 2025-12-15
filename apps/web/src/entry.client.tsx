import { render, type RenderOptions } from '@builder.io/qwik'
import Root from './root'

export default function renderClient(opts: RenderOptions) {
  return render(document, <Root />, opts)
}

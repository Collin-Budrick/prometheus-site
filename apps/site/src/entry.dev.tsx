import { render, type RenderOptions } from '@builder.io/qwik'
import Root from './root'

export default function (opts: RenderOptions) {
  void render(document, <Root />, opts)
}

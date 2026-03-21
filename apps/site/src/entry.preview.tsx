import { createQwikCity } from '@builder.io/qwik-city/middleware/node'
import { manifest } from '@qwik-client-manifest'
import qwikCityPlan from '@qwik-city-plan'
import render from './entry.ssr'

const previewRender = render as Parameters<typeof createQwikCity>[0]['render']

export default createQwikCity({
  render: previewRender,
  manifest,
  qwikCityPlan
})

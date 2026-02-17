import { createQwikCity } from '@builder.io/qwik-city/middleware/node'
import { manifest } from '@qwik-client-manifest'
import qwikCityPlan from '@qwik-city-plan'
import render from './entry.ssr'

export default createQwikCity({
  render,
  manifest,
  qwikCityPlan
})

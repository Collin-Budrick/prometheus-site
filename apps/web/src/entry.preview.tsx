import { createQwikCity } from '@builder.io/qwik-city/middleware/node'
import { manifest } from '@qwik-client-manifest'
import qwikCityPlan from '@qwik-city-plan'
import render from './entry.ssr'

/**
 * Vite preview entry for SSR; mirrors the production adapter but runs in Node.
 */
const { router, notFound } = createQwikCity({ render, qwikCityPlan, manifest })

export default { router, notFound }
export { router, notFound }

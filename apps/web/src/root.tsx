import { component$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { RouterHead } from './routes/layout'
import { RouteTransitionBoundary } from './components/route-transition/route-transition'
import 'virtual:uno.css'
import './global.css'

declare const __EXPERIMENTAL__: Record<string, unknown> | undefined

// Ensure Qwik City experimental flag exists on both client and server to avoid runtime failures.
const experimentalGlobal =
  (typeof __EXPERIMENTAL__ !== 'undefined' && __EXPERIMENTAL__) || (globalThis as typeof globalThis & { __EXPERIMENTAL__?: Record<string, unknown> }).__EXPERIMENTAL__ || {}
;(globalThis as typeof globalThis & { __EXPERIMENTAL__: Record<string, unknown> }).__EXPERIMENTAL__ = experimentalGlobal

export default component$(() => (
  <QwikCityProvider>
    <head>
      <meta charSet="utf-8" />
      <RouterHead />
    </head>
    <body class="app-shell">
      <RouteTransitionBoundary>
        <RouterOutlet />
      </RouteTransitionBoundary>
    </body>
  </QwikCityProvider>
))

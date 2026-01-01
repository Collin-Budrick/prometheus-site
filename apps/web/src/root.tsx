import { component$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { RouteMotion } from './components/RouteMotion'
import { RouterHead } from './routes/layout'
import './global.css'

export default component$(() => (
  <QwikCityProvider viewTransition>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <RouterHead />
    </head>
    <body class="app-shell">
      <RouteMotion />
      <RouterOutlet />
    </body>
  </QwikCityProvider>
))

import { component$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city'
import { RouterHead } from './routes/layout'
import 'virtual:uno.css'
import './global.css'

export default component$(() => (
  <QwikCityProvider>
    <head>
      <meta charSet="utf-8" />
      <RouterHead />
    </head>
    <body class="app-shell">
      <RouterOutlet />
      {import.meta.env.PROD && <ServiceWorkerRegister />}
    </body>
  </QwikCityProvider>
))

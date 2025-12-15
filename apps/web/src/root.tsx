import { component$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city'
import { RouterHead } from './routes/layout'
import './global.css'

export default component$(() => (
  <QwikCityProvider>
    <head>
      <meta charSet="utf-8" />
      <link rel="preconnect" href="https://fonts.gstatic.com" />
      <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <RouterHead />
    </head>
    <body class="app-shell">
      <RouterOutlet />
      <ServiceWorkerRegister />
    </body>
  </QwikCityProvider>
))

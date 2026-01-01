import { component$, useVisibleTask$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { RouteMotion } from './components/RouteMotion'
import { RouterHead } from './routes/layout'
import './global.css'

const DocumentLang = component$(() => {
  useVisibleTask$(() => {
    const html = document.documentElement
    if (!html.lang) html.lang = 'en'
  })
  return null
})

export default component$(() => (
  <QwikCityProvider viewTransition>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <RouterHead />
    </head>
    <body class="app-shell">
      <DocumentLang />
      <RouteMotion />
      <RouterOutlet />
    </body>
  </QwikCityProvider>
))

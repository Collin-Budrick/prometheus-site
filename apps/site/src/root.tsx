import { component$, useStyles$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { ClientExtras, useClientReady } from '@core'
import globalStyles from '@prometheus/ui/global.css?inline'
import { RouterHead } from './routes/layout'
import { FragmentStatusProvider } from './shared/fragment-status'
import { LangProvider } from './shared/lang-bridge'
import { appConfig } from './app-config'

export default component$(() => {
  useStyles$(globalStyles)
  const clientReady = useClientReady()

  return (
    <QwikCityProvider viewTransition>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <RouterHead />
      </head>
      <body class="app-shell">
        {clientReady.value ? <ClientExtras config={appConfig} /> : null}
        <LangProvider>
          <FragmentStatusProvider>
            <RouterOutlet />
          </FragmentStatusProvider>
        </LangProvider>
      </body>
    </QwikCityProvider>
  )
})

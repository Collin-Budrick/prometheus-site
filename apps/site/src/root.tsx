import { component$, useStyles$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import { ClientExtras, useClientReady, type ClientExtrasConfig } from '@core'
import { createClientErrorReporter } from '@platform/logging'
import { RouteMotion } from '@prometheus/ui'
import globalStyles from '@prometheus/ui/global.css?inline'
import { RouterHead } from './routes/layout'
import { FragmentStatusProvider } from '@core/fragments'
import { LangProvider } from './shared/lang-bridge'
import { appConfig } from './app-config'

export default component$(() => {
  useStyles$(globalStyles)
  const clientReady = useClientReady()
  const clientExtrasConfig: ClientExtrasConfig = {
    apiBase: appConfig.apiBase,
    enablePrefetch: appConfig.enablePrefetch,
    analytics: appConfig.analytics,
    reportClientError: createClientErrorReporter(appConfig.clientErrors)
  }

  return (
    <QwikCityProvider viewTransition>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <RouterHead />
      </head>
      <body class="app-shell">
        {clientReady.value ? (
          <>
            <ClientExtras config={clientExtrasConfig} />
            <RouteMotion />
          </>
        ) : null}
        <LangProvider>
          <FragmentStatusProvider>
            <RouterOutlet />
          </FragmentStatusProvider>
        </LangProvider>
      </body>
    </QwikCityProvider>
  )
})

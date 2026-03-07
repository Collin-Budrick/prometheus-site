import { component$, useStyles$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'
import globalCriticalStyles from '@prometheus/ui/global-critical.css?inline'
import globalStyles from '@prometheus/ui/global.css?inline'
import { RouterHead } from './routes/layout'
import { FragmentStatusProvider } from '@core/fragments'

const viewportFadeHeadStyle = `
  .viewport-fade {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 100vh;
    pointer-events: none;
    z-index: 60;
    background:
      linear-gradient(
        to bottom,
        rgb(var(--viewport-fade-color) / 0.95),
        rgb(var(--viewport-fade-color) / 0)
      )
        top / 100% var(--viewport-fade-size) no-repeat,
      linear-gradient(
        to top,
        rgb(var(--viewport-fade-color) / 0.9),
        rgb(var(--viewport-fade-color) / 0)
      )
        bottom / 100% var(--viewport-fade-size) no-repeat;
  }

  @supports (height: 1svh) {
    .viewport-fade {
      height: 100svh;
    }
  }
`

export default component$(() => {
  useStyles$(globalCriticalStyles)
  useStyles$(globalStyles)

  return (
    <QwikCityProvider>
      <head>
        <meta charSet="utf-8" />
        <style>{viewportFadeHeadStyle}</style>
        <RouterHead />
      </head>
      <body class="app-shell">
        <FragmentStatusProvider>
          <RouterOutlet />
        </FragmentStatusProvider>
        <div class="viewport-fade" aria-hidden="true" />
      </body>
    </QwikCityProvider>
  )
})

import { component$ } from '@builder.io/qwik'
import { asTrustedHtml } from '../security/client'
import { useCspNonce } from '../security/qwik'
import { buildFragmentHeightPersistenceScript } from './fragment-height-script'
import { serializeFragmentHeightLayout } from '@prometheus/ui/fragment-height'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_FRAGMENT_VERSION_ATTR
} from './constants'
import type { StaticFragmentRouteModel } from './static-fragment-model'

type StaticFragmentRouteProps = {
  model: StaticFragmentRouteModel
}

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

export const StaticFragmentRoute = component$<StaticFragmentRouteProps>(({ model }) => {
  const entries = model.entries
  const leftCount = Math.ceil(entries.length / 2)
  const nonce = useCspNonce()

  return (
    <section
      class="fragment-shell fragment-shell-static"
      data-static-fragment-root
      data-static-path={model.path}
      data-static-lang={model.lang}
    >
      {model.inlineStyles.map((fragment) => (
        <style key={fragment.id} nonce={nonce || undefined} data-fragment-css={fragment.id}>
          {fragment.css}
        </style>
      ))}
      <div class="fragment-grid fragment-grid-static-home" data-fragment-grid="main">
        {entries.map((entry, index) => {
          const column = index < leftCount ? '1' : '2'
          const style = {
            '--fragment-min-height': `${entry.reservedHeight}px`,
            gridColumn: column
          }

          return (
            <article
              key={entry.id}
              class="fragment-card fragment-card-static-home"
              data-critical={entry.critical ? 'true' : undefined}
              data-fragment-id={entry.id}
              data-fragment-loaded="true"
              data-fragment-ready="true"
              data-fragment-stage="ready"
              data-reveal-locked="false"
              data-draggable="false"
              data-fragment-height-hint={`${entry.reservedHeight}`}
              data-fragment-height-layout={serializeFragmentHeightLayout(entry.layout) ?? undefined}
              data-size={entry.size}
              style={style}
              {...{
                [STATIC_FRAGMENT_CARD_ATTR]: 'true',
                [STATIC_FRAGMENT_VERSION_ATTR]: entry.version ? `${entry.version}` : undefined
              }}
            >
              <div class="fragment-card-body" {...{ [STATIC_FRAGMENT_BODY_ATTR]: entry.id }}>
                <div class="fragment-html" dangerouslySetInnerHTML={asTrustedHtml(entry.html, 'server') as string} />
              </div>
            </article>
          )
        })}
      </div>
      <script
        id={STATIC_FRAGMENT_DATA_SCRIPT_ID}
        type="application/json"
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={serializeJson(model.routeData)}
      />
      <script
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={buildFragmentHeightPersistenceScript({
          path: model.path,
          lang: model.lang,
          fragmentOrder: model.routeData.fragmentOrder,
          planSignature: model.routeData.planSignature,
          versionSignature: model.routeData.versionSignature
        })}
      />
    </section>
  )
})

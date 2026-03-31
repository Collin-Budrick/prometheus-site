import { component$ } from '@builder.io/qwik'
import { asTrustedHtml } from '../../security/client'
import { useCspNonce } from '../../security/qwik'
import { serializeFragmentHeightLayout } from '@prometheus/ui/fragment-height'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_DATA_SCRIPT_ID,
  STATIC_FRAGMENT_PAINT_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR
} from '../core/constants'
import type { StaticFragmentRouteModel } from './static-fragment-model'
import { READY_STAGGER_STATE_ATTR } from '@prometheus/ui/ready-stagger'
import { buildPretextCardAttrs } from '../pretext/pretext-static'

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
  const nonce = useCspNonce()

  return (
    <section
      class="fragment-shell fragment-shell-static"
      data-static-fragment-root
      data-static-path={model.path}
      data-static-lang={model.lang}
      {...{ [STATIC_FRAGMENT_PAINT_ATTR]: 'initial' }}
    >
      {model.inlineStyles.map((fragment) => (
        <style key={fragment.id} nonce={nonce || undefined} data-fragment-css={fragment.id}>
          {fragment.css}
        </style>
      ))}
      <noscript>
        <style nonce={nonce || undefined}>
          {
            "[data-static-fragment-root] .fragment-card[data-reveal-phase='visible']{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;}"
          }
        </style>
      </noscript>
      <div class="fragment-grid fragment-grid-static-home" data-fragment-grid="main">
        {entries.map((entry, index) => {
          const column = entry.layout.column || 'span 12'
          const style = {
            '--fragment-min-height': `${entry.reservedHeight}px`,
            gridColumn: column
          }

          return (
            <article
              key={entry.id ?? `fragment-card-${index}`}
              class="fragment-card fragment-card-static-home"
              data-critical={entry.critical ? 'true' : undefined}
              data-fragment-id={entry.id}
              data-fragment-loaded="true"
              data-fragment-ready="true"
              data-fragment-stage="ready"
              data-reveal-phase="visible"
              data-reveal-locked="false"
              data-draggable="false"
              data-fragment-height-hint={`${entry.reservedHeight}`}
              data-fragment-height-layout={serializeFragmentHeightLayout(entry.layout) ?? undefined}
              data-size={entry.size}
              style={style}
              {...{
                ...buildPretextCardAttrs({ mode: entry.pretextCardMode }),
                [STATIC_FRAGMENT_CARD_ATTR]: 'true',
                [STATIC_FRAGMENT_VERSION_ATTR]: entry.version ? `${entry.version}` : undefined,
                [STATIC_FRAGMENT_WIDTH_BUCKET_ATTR]:
                  entry.desktopWidthBucket ?? entry.mobileWidthBucket ?? undefined,
                [STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR]:
                  entry.mobileWidthBucket && entry.mobileWidthBucket !== entry.desktopWidthBucket
                    ? entry.mobileWidthBucket
                    : undefined,
                [READY_STAGGER_STATE_ATTR]: 'done'
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
    </section>
  )
})

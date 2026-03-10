import { component$ } from '@builder.io/qwik'
import { getFragmentCssHref } from '../fragment/fragment-css'
import type { FragmentPayloadValue, FragmentPlanValue } from '../fragment/types'
import type { Lang } from '../lang'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyUiCopy,
  emptyWasmRendererDemoCopy,
  type LanguageSeedPayload
} from '../lang/selection'
import { renderHomeStaticFragmentHtml } from './home-render'
import { renderMarkdownToHtml } from './markdown'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PAINT_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_DATA_SCRIPT_ID,
  getStaticShellRouteConfig
} from './constants'
import { getHomeStaticFragmentKind } from './home-render'

type StaticHomeRouteProps = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  lang: Lang
  introMarkdown: string
  languageSeed: LanguageSeedPayload
}

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

const DEFAULT_RESERVED_CARD_HEIGHT = 180

type StaticHomeRenderedCard = {
  id: string
  critical: boolean
  size: string | undefined
  html: string
  column: '1' | '2'
  reservedHeight: number
  fragmentKind: ReturnType<typeof getHomeStaticFragmentKind>
  version: string | undefined
  patchState: 'ready' | 'pending'
}

type StaticHomeRouteState = {
  paintState: 'initial'
  inlineStyles: Array<{ id: string; css: string }>
  fragmentVersions: Record<string, number>
  cards: StaticHomeRenderedCard[]
}

const createStaticHomeCopyBundle = (languageSeed: LanguageSeedPayload) => ({
  ui: {
    ...emptyUiCopy,
    ...(languageSeed.ui ?? {})
  },
  planner: {
    ...emptyPlannerDemoCopy,
    ...(languageSeed.demos?.planner ?? {})
  },
  wasmRenderer: {
    ...emptyWasmRendererDemoCopy,
    ...(languageSeed.demos?.wasmRenderer ?? {})
  },
  reactBinary: {
    ...emptyReactBinaryDemoCopy,
    ...(languageSeed.demos?.reactBinary ?? {})
  },
  preactIsland: {
    ...emptyPreactIslandCopy,
    ...(languageSeed.demos?.preactIsland ?? {})
  }
})

export const buildStaticHomeRouteState = ({
  plan,
  fragments,
  languageSeed
}: Pick<StaticHomeRouteProps, 'plan' | 'fragments' | 'languageSeed'>): StaticHomeRouteState | null => {
  if (!plan) {
    return null
  }

  const fragmentMap = fragments ?? {}
  const copyBundle = createStaticHomeCopyBundle(languageSeed)
  const entries = plan.fragments
  const leftCount = Math.ceil(entries.length / 2)
  const fragmentHeaders = languageSeed.fragmentHeaders ?? {}

  const inlineStyles = entries
    .map((entry) => fragmentMap[entry.id])
    .filter((fragment) => fragment?.css && !getFragmentCssHref(fragment.id)) as Array<{ id: string; css: string }>

  const fragmentVersions = entries.reduce<Record<string, number>>((acc, entry) => {
    const value = fragmentMap[entry.id]?.cacheUpdatedAt
    if (typeof value === 'number' && Number.isFinite(value)) {
      acc[entry.id] = value
    }
    return acc
  }, {})

  const cards = entries.map<StaticHomeRenderedCard>((entry, index) => {
    const fragment = fragmentMap[entry.id]
    const fragmentKind = getHomeStaticFragmentKind(entry.id)
    const html = fragment
      ? renderHomeStaticFragmentHtml(fragment.tree, copyBundle, {
          mode: fragmentKind === 'manifest' ? 'rich' : 'stub',
          fragmentId: entry.id,
          fragmentHeaders
        })
      : ''
    const reservedHeight =
      typeof entry.layout.minHeight === 'number' && Number.isFinite(entry.layout.minHeight)
        ? Math.max(0, entry.layout.minHeight)
        : DEFAULT_RESERVED_CARD_HEIGHT

    return {
      id: entry.id,
      critical: Boolean(entry.critical),
      size: entry.layout.size,
      html,
      column: index < leftCount ? '1' : '2',
      reservedHeight,
      fragmentKind,
      version: fragment?.cacheUpdatedAt ? `${fragment.cacheUpdatedAt}` : undefined,
      patchState: fragmentKind === 'manifest' ? 'ready' : 'pending'
    }
  })

  return {
    paintState: 'initial',
    inlineStyles,
    fragmentVersions,
    cards
  }
}

export const StaticHomeRoute = component$<StaticHomeRouteProps>(({ plan, fragments, lang, introMarkdown, languageSeed }) => {
  const routeState = buildStaticHomeRouteState({ plan, fragments, languageSeed })
  if (!plan || !routeState) {
    return null
  }

  const routeConfig = getStaticShellRouteConfig(plan.path)

  return (
    <section
      class="fragment-shell fragment-shell-static"
      data-static-home-root
      data-static-path={plan.path}
      data-static-lang={lang}
      {...{ [STATIC_HOME_PAINT_ATTR]: routeState.paintState }}
    >
      {routeState.inlineStyles.map((fragment) => (
        <style key={fragment.id} data-fragment-css={fragment.id} dangerouslySetInnerHTML={fragment.css} />
      ))}
      <div class="fragment-grid" data-fragment-grid="intro">
        <div class="fragment-slot" data-variant="text" data-critical="true" style={{ gridColumn: '1 / -1' }}>
          <article
            class="fragment-card"
            data-variant="text"
            data-draggable="false"
            data-critical="true"
            data-fragment-id="shell-intro"
            data-fragment-loaded="true"
            data-fragment-ready="true"
            data-fragment-stage="ready"
            data-reveal-locked="false"
          >
            <div class="fragment-card-body">
              <div class="fragment-markdown" dangerouslySetInnerHTML={renderMarkdownToHtml(introMarkdown)} />
            </div>
          </article>
        </div>
      </div>
      <div class="fragment-grid fragment-grid-static-home" data-fragment-grid="main">
        {routeState.cards.map((card) => {
          const style = {
            '--fragment-min-height': `${card.reservedHeight}px`,
            gridColumn: card.column
          }

          return (
            <article
              key={card.id}
              class={{
                'fragment-card': true,
                'fragment-card-static-home': true
              }}
              data-critical={card.critical ? 'true' : undefined}
              data-fragment-id={card.id}
              data-fragment-loaded="true"
              data-fragment-ready="true"
              data-fragment-stage="ready"
              data-reveal-locked="false"
              data-draggable="false"
              data-size={card.size}
              style={style}
              {...{
                [STATIC_FRAGMENT_CARD_ATTR]: 'true',
                [STATIC_FRAGMENT_VERSION_ATTR]: card.version,
                [STATIC_HOME_FRAGMENT_KIND_ATTR]: card.fragmentKind,
                [STATIC_HOME_PATCH_STATE_ATTR]: card.patchState
              }}
            >
              <div class="fragment-card-body" {...{ [STATIC_FRAGMENT_BODY_ATTR]: card.id }}>
                <div class="fragment-html" dangerouslySetInnerHTML={card.html} />
              </div>
            </article>
          )
        })}
      </div>
      <script
        id={STATIC_HOME_DATA_SCRIPT_ID}
        type="application/json"
        dangerouslySetInnerHTML={serializeJson({
          lang,
          path: plan.path,
          snapshotKey: routeConfig?.snapshotKey ?? plan.path,
          authPolicy: routeConfig?.authPolicy ?? 'public',
          bootstrapMode: routeConfig?.bootstrapMode ?? 'home-static',
          languageSeed,
          fragmentVersions: routeState.fragmentVersions
        })}
      />
    </section>
  )
})

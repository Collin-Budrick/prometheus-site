import { component$ } from '@builder.io/qwik'
import { getFragmentCssHref } from '../fragment/fragment-css'
import type { FragmentPayloadValue, FragmentPlanValue } from '../fragment/types'
import type { Lang } from '../lang'
import homeDemoStylesheetHref from './home-static-deferred.css?url'
import {
  emptyPlannerDemoCopy,
  emptyPreactIslandCopy,
  emptyReactBinaryDemoCopy,
  emptyUiCopy,
  emptyWasmRendererDemoCopy,
  type LanguageSeedPayload
} from '../lang/selection'
import { renderHomeStaticFragmentHtml } from './home-render'
import { renderHomeIntroMarkdownToHtml } from './markdown'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_PAINT_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_STAGE_ATTR,
  STATIC_HOME_DATA_SCRIPT_ID,
  getStaticShellRouteConfig,
  type StaticHomeCardStage
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
const DEFERRED_RESERVED_HEIGHT_BY_SIZE: Record<string, number> = {
  small: 272,
  big: 280,
  tall: 372
}
const DEFERRED_RESERVED_HEIGHT_BY_KIND = {
  island: 272,
  react: 272,
  ledger: 372
} as const

const isStaticHomePreviewKind = (fragmentKind: ReturnType<typeof getHomeStaticFragmentKind>) =>
  fragmentKind === 'planner' || fragmentKind === 'ledger' || fragmentKind === 'island' || fragmentKind === 'react'

const resolveStaticHomeReservedHeight = (
  reservedHeight: number,
  stage: StaticHomeCardStage,
  size: string | undefined,
  fragmentKind: ReturnType<typeof getHomeStaticFragmentKind>
) => {
  if (stage !== 'deferred') {
    return reservedHeight
  }

  const deferredKindHeight = DEFERRED_RESERVED_HEIGHT_BY_KIND[fragmentKind]
  if (typeof deferredKindHeight === 'number') {
    return deferredKindHeight
  }

  const deferredHeight = size ? DEFERRED_RESERVED_HEIGHT_BY_SIZE[size] : undefined
  if (typeof deferredHeight !== 'number') {
    return Math.min(reservedHeight, DEFERRED_RESERVED_HEIGHT_BY_SIZE.small)
  }

  return Math.min(reservedHeight, deferredHeight)
}

type StaticHomeRenderedCard = {
  id: string
  order: number
  critical: boolean
  size: string | undefined
  html: string
  column: '1' | '2'
  stage: StaticHomeCardStage
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

  const anchorColumns = new Set<'1' | '2'>()

  const cards = entries.map<StaticHomeRenderedCard>((entry, index) => {
    const fragment = fragmentMap[entry.id]
    const fragmentKind = getHomeStaticFragmentKind(entry.id)
    const column = index < leftCount ? '1' : '2'
    const stage: StaticHomeCardStage = entry.critical
      ? 'critical'
      : !anchorColumns.has(column)
        ? (anchorColumns.add(column), 'anchor')
        : 'deferred'
    const renderMode =
      stage === 'critical'
        ? 'rich'
        : isStaticHomePreviewKind(fragmentKind)
          ? 'preview'
          : fragmentKind === 'dock'
            ? 'shell'
            : stage === 'anchor'
              ? 'shell'
              : 'stub'
    const patchState = stage === 'critical' || fragmentKind === 'dock' || renderMode === 'preview' ? 'ready' : 'pending'
    const html = fragment
      ? renderHomeStaticFragmentHtml(fragment.tree, copyBundle, {
          mode: renderMode,
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
      order: index,
      critical: Boolean(entry.critical),
      size: entry.layout.size,
      html,
      column,
      stage,
      fragmentKind,
      reservedHeight: resolveStaticHomeReservedHeight(reservedHeight, stage, entry.layout.size, fragmentKind),
      version: fragment?.cacheUpdatedAt ? `${fragment.cacheUpdatedAt}` : undefined,
      patchState
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
  const columns = routeState.cards.reduce<Record<'1' | '2', StaticHomeRenderedCard[]>>(
    (acc, card) => {
      acc[card.column].push(card)
      return acc
    },
    { '1': [], '2': [] }
  )

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
              <div class="home-intro" dangerouslySetInnerHTML={renderHomeIntroMarkdownToHtml(introMarkdown)} />
            </div>
          </article>
        </div>
      </div>
      <div class="fragment-grid fragment-grid-static-home" data-fragment-grid="main">
        {(['1', '2'] as const).map((column) => (
          <div key={column} class="fragment-grid-static-home-column" data-static-home-column={column}>
            {columns[column].map((card) => {
              const style = {
                '--fragment-min-height': `${card.reservedHeight}px`,
                order: card.order
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
                    [STATIC_HOME_STAGE_ATTR]: card.stage,
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
        ))}
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
          homeDemoStylesheetHref,
          languageSeed,
          fragmentVersions: routeState.fragmentVersions
        })}
      />
    </section>
  )
})

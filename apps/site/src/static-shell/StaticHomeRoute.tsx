import { component$ } from '@builder.io/qwik'
import { getFragmentCssHref } from '../fragment/fragment-css'
import type { FragmentPayload, FragmentPayloadValue, FragmentPlanValue } from '../fragment/types'
import type { FragmentRuntimePlanEntry } from '../fragment/runtime/protocol'
import type { Lang } from '../lang'
import { asTrustedHtml } from '../security/client'
import { useCspNonce } from '../security/qwik'
import homeInteractiveDeferredStylesheetHref from './home-static-deferred.css?url'
import {
  type LanguageSeedPayload
} from '../lang/selection'
import { renderHomeStaticFragmentHtml } from './home-render'
import { renderHomeIntroMarkdownToHtml } from './markdown'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_ATTR,
  STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR,
  STATIC_HOME_FRAGMENT_KIND_ATTR,
  STATIC_HOME_LCP_STABLE_ATTR,
  STATIC_HOME_PAINT_ATTR,
  STATIC_HOME_PATCH_STATE_ATTR,
  STATIC_HOME_PREVIEW_VISIBLE_ATTR,
  STATIC_HOME_STAGE_ATTR,
  STATIC_HOME_DATA_SCRIPT_ID,
  getStaticShellRouteConfig,
  type StaticHomeCardStage
} from './constants'
import { getHomeStaticFragmentKind } from './home-render'
import { buildHomeFragmentBootstrapHref } from './home-fragment-bootstrap'
import {
  buildFragmentHeightPlanSignature,
  buildFragmentHeightVersionSignature,
  readFragmentStableHeight,
  resolveFragmentHeightWidthBucket,
  resolveReservedFragmentHeight,
  type FragmentHeightLayout
} from '@prometheus/ui/fragment-height'
import {
  createSeededHomeStaticCopyBundle,
  createSeededHomeStaticFragmentHeaders
} from './home-copy-bundle'
import {
  serializeHomeFragmentVersions,
  serializeHomeRuntimeFetchGroups,
  serializeHomeRuntimePlanEntries
} from './home-bootstrap-data'

type StaticHomeRouteProps = {
  plan: FragmentPlanValue
  fragments: FragmentPayloadValue
  lang: Lang
  introMarkdown: string
  languageSeed: LanguageSeedPayload
  serverHeightHints?: Array<number | null> | null
}

const serializeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

const DEFAULT_RESERVED_CARD_HEIGHT = 180
const HOME_HERO_FRAGMENT_IDS = new Set([
  'fragment://page/home/manifest@v1',
  'fragment://page/home/dock@v2'
])
const HOME_RENDER_ORDER = [
  'fragment://page/home/manifest@v1',
  'fragment://page/home/dock@v2',
  'fragment://page/home/planner@v1',
  'fragment://page/home/ledger@v1',
  'fragment://page/home/island@v1',
  'fragment://page/home/react@v1'
] as const

const isStaticHomePreviewKind = (fragmentKind: ReturnType<typeof getHomeStaticFragmentKind>) =>
  fragmentKind === 'planner' ||
  fragmentKind === 'ledger' ||
  fragmentKind === 'island' ||
  fragmentKind === 'react' ||
  fragmentKind === 'dock'

const usesActiveHomeDemoShell = (fragmentKind: ReturnType<typeof getHomeStaticFragmentKind>) =>
  fragmentKind === 'planner' ||
  fragmentKind === 'ledger' ||
  fragmentKind === 'island' ||
  fragmentKind === 'react'

type StaticHomeRenderedCard = {
  id: string
  order: number
  critical: boolean
  size: string | undefined
  html: string
  column: '1' | '2'
  stage: StaticHomeCardStage
  layout: FragmentHeightLayout
  reservedHeight: number
  fragmentKind: ReturnType<typeof getHomeStaticFragmentKind>
  version: string | undefined
  desktopWidthBucket: string | null
  mobileWidthBucket: string | null
  patchState: 'ready' | 'pending'
  revealPhase: 'holding' | 'visible'
  previewVisible: boolean
  lcpStable: boolean
  placement: 'hero' | 'main'
}

type StaticHomeRouteState = {
  paintState: 'initial'
  inlineStyles: Array<{ id: string; css: string }>
  fragmentVersions: Record<string, number>
  fragmentOrder: string[]
  planSignature: string
  versionSignature: string
  runtimePlanEntries: FragmentRuntimePlanEntry[]
  runtimeFetchGroups: string[][]
  runtimeInitialFragments: FragmentPayload[]
  cards: StaticHomeRenderedCard[]
}

export const buildStaticHomeRouteState = ({
  plan,
  fragments,
  languageSeed,
  lang,
  serverHeightHints
}: Pick<
  StaticHomeRouteProps,
  'plan' | 'fragments' | 'languageSeed' | 'lang' | 'serverHeightHints'
>): StaticHomeRouteState | null => {
  if (!plan) {
    return null
  }

  const fragmentMap = fragments ?? {}
  const copyBundle = createSeededHomeStaticCopyBundle(languageSeed)
  const orderIndex = new Map(HOME_RENDER_ORDER.map((id, index) => [id, index]))
  const entries = [...plan.fragments].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }
    return plan.fragments.indexOf(left) - plan.fragments.indexOf(right)
  })
  const fragmentOrder = entries.map((entry) => entry.id)
  const planSignature = buildFragmentHeightPlanSignature(fragmentOrder)
  const fragmentHeaders = createSeededHomeStaticFragmentHeaders(languageSeed)

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
  const versionSignature = buildFragmentHeightVersionSignature(fragmentVersions, fragmentOrder)
  const runtimePlanEntries = entries.map<FragmentRuntimePlanEntry>((entry) => ({
    id: entry.id,
    critical: entry.critical,
    layout: entry.layout,
    dependsOn: entry.dependsOn ?? [],
    cacheUpdatedAt: entry.cache?.updatedAt
  }))
  const runtimeFetchGroups = plan.fetchGroups?.map((group) => [...group]) ?? []

  const cards = entries.map<StaticHomeRenderedCard>((entry, index) => {
    const fragment = fragmentMap[entry.id]
    const fragmentKind = getHomeStaticFragmentKind(entry.id)
    const placement = HOME_HERO_FRAGMENT_IDS.has(entry.id) ? 'hero' : 'main'
    const stage: StaticHomeCardStage = entry.critical
      ? 'critical'
      : fragmentKind === 'dock'
        ? 'anchor'
        : 'deferred'
    const activeShell = usesActiveHomeDemoShell(fragmentKind)
    const renderMode =
      stage === 'critical'
        ? 'rich'
        : activeShell
          ? 'active-shell'
        : isStaticHomePreviewKind(fragmentKind)
          ? 'preview'
          : fragmentKind === 'dock'
            ? 'shell'
            : stage === 'anchor'
              ? 'shell'
              : 'stub'
    const previewVisible = renderMode === 'preview' || renderMode === 'active-shell'
    const patchState = stage === 'critical' ? 'ready' : 'pending'
    const lcpStable = Boolean(entry.critical || fragmentKind === 'dock')
    const html = fragment
      ? renderHomeStaticFragmentHtml(fragment.tree, copyBundle, {
          mode: renderMode,
          fragmentId: entry.id,
          fragmentHeaders
        })
      : ''
    const reservedHeight = resolveReservedFragmentHeight({
      layout: entry.layout,
      cookieHeight: serverHeightHints?.[index] ?? null,
      stableHeight: readFragmentStableHeight({
        fragmentId: entry.id,
        path: plan.path,
        lang,
        planSignature,
        versionSignature
      })
    }) ?? DEFAULT_RESERVED_CARD_HEIGHT
    const desktopWidthBucket =
      resolveFragmentHeightWidthBucket({
        layout: entry.layout,
        viewport: 'desktop'
      }) ?? null
    const mobileWidthBucket =
      resolveFragmentHeightWidthBucket({
        layout: entry.layout,
        viewport: 'mobile'
      }) ?? null

    return {
      id: entry.id,
      order: index,
      critical: Boolean(entry.critical),
      size: entry.layout.size,
      html,
      column: placement === 'hero' ? (fragmentKind === 'dock' ? '2' : '1') : '1',
      stage,
      layout: entry.layout,
      fragmentKind,
      reservedHeight,
      version: fragment?.cacheUpdatedAt ? `${fragment.cacheUpdatedAt}` : undefined,
      desktopWidthBucket,
      mobileWidthBucket,
      patchState,
      revealPhase: patchState === 'ready' || previewVisible ? 'visible' : 'holding',
      previewVisible,
      lcpStable,
      placement
    }
  })

  return {
    paintState: 'initial',
    inlineStyles,
    fragmentVersions,
    fragmentOrder,
    planSignature,
    versionSignature,
    runtimePlanEntries,
    runtimeFetchGroups,
    runtimeInitialFragments: [],
    cards
  }
}

export const StaticHomeRoute = component$<StaticHomeRouteProps>(({ plan, fragments, lang, introMarkdown, languageSeed, serverHeightHints }) => {
  const routeState = buildStaticHomeRouteState({ plan, fragments, languageSeed, lang, serverHeightHints })
  const nonce = useCspNonce()
  if (!plan || !routeState) {
    return null
  }

  const routeConfig = getStaticShellRouteConfig(plan.path)
  const fragmentBootstrapHref = buildHomeFragmentBootstrapHref({ lang })
  const serializedRuntimePlanEntries = serializeHomeRuntimePlanEntries(routeState.runtimePlanEntries)
  const serializedRuntimeFetchGroups = serializeHomeRuntimeFetchGroups(
    routeState.runtimeFetchGroups,
    routeState.fragmentOrder
  )
  const serializedFragmentVersions = serializeHomeFragmentVersions(
    routeState.fragmentVersions,
    routeState.fragmentOrder
  )
  const splitCards = (cards: StaticHomeRenderedCard[]) =>
    cards.reduce<Record<'1' | '2', StaticHomeRenderedCard[]>>(
      (acc, card, index) => {
        const column =
          card.placement === 'hero'
            ? card.column
            : index < Math.ceil(cards.length / 2)
              ? '1'
              : '2'
        acc[column].push({ ...card, column })
        return acc
      },
      { '1': [], '2': [] }
    )
  const heroCards = routeState.cards.filter((card) => card.placement === 'hero')
  const mainCards = routeState.cards.filter((card) => card.placement === 'main')
  const heroColumns = splitCards(heroCards)
  const mainColumns = splitCards(mainCards)
  const combinedColumns = {
    '1': [...heroColumns['1'], ...mainColumns['1']],
    '2': [...heroColumns['2'], ...mainColumns['2']]
  } as const
  const renderHomeCard = (card: StaticHomeRenderedCard) => {
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
        data-fragment-ready={card.patchState === 'ready' ? 'true' : undefined}
        data-fragment-stage={card.patchState === 'ready' ? 'ready' : 'waiting-payload'}
        data-reveal-phase={card.revealPhase}
        data-reveal-locked="false"
        data-draggable="false"
        data-size={card.size}
        style={style}
        {...{
          [STATIC_FRAGMENT_CARD_ATTR]: 'true',
          [STATIC_FRAGMENT_VERSION_ATTR]: card.version,
          [STATIC_FRAGMENT_WIDTH_BUCKET_ATTR]:
            card.desktopWidthBucket ?? card.mobileWidthBucket ?? undefined,
          [STATIC_FRAGMENT_WIDTH_BUCKET_MOBILE_ATTR]:
            card.mobileWidthBucket && card.mobileWidthBucket !== card.desktopWidthBucket
              ? card.mobileWidthBucket
              : undefined,
          [STATIC_HOME_FRAGMENT_KIND_ATTR]: card.fragmentKind,
          [STATIC_HOME_LCP_STABLE_ATTR]: card.lcpStable ? 'true' : undefined,
          [STATIC_HOME_STAGE_ATTR]: card.stage,
          [STATIC_HOME_PATCH_STATE_ATTR]: card.patchState,
          [STATIC_HOME_PREVIEW_VISIBLE_ATTR]: card.previewVisible ? 'true' : undefined,
          'data-fragment-height-hint': `${card.reservedHeight}`
        }}
      >
        <div class="fragment-card-body" {...{ [STATIC_FRAGMENT_BODY_ATTR]: card.id }}>
          <div class="fragment-html" dangerouslySetInnerHTML={asTrustedHtml(card.html, 'server') as string} />
        </div>
      </article>
    )
  }

  return (
    <section
      class="fragment-shell fragment-shell-static"
      data-static-home-root
      data-static-path={plan.path}
      data-static-lang={lang}
      {...{ [STATIC_HOME_PAINT_ATTR]: routeState.paintState }}
    >
      {routeState.inlineStyles.map((fragment) => (
        <style key={fragment.id} nonce={nonce || undefined} data-fragment-css={fragment.id}>
          {fragment.css}
        </style>
      ))}
      <noscript>
        <style nonce={nonce || undefined}>
          {
            "[data-static-home-root] .fragment-card[data-reveal-phase='holding']{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;}"
          }
        </style>
      </noscript>
      <div class="fragment-grid" data-fragment-grid="intro">
        <div class="fragment-slot" data-variant="text" data-critical="true" style={{ gridColumn: '1 / -1' }}>
          <article
            class="fragment-card"
            data-variant="text"
            data-draggable="false"
            data-critical="true"
            {...{ [STATIC_HOME_LCP_STABLE_ATTR]: 'true' }}
            data-fragment-id="shell-intro"
            data-fragment-loaded="true"
            data-fragment-ready="true"
            data-fragment-stage="ready"
            data-reveal-phase="visible"
            data-reveal-locked="false"
          >
            <div class="fragment-card-body">
              <div
                class="home-intro"
                dangerouslySetInnerHTML={asTrustedHtml(renderHomeIntroMarkdownToHtml(introMarkdown), 'template') as string}
              />
            </div>
          </article>
        </div>
      </div>
      <div class="fragment-grid fragment-grid-static-home" data-fragment-grid="main">
        {(['1', '2'] as const).map((column) => (
          <div key={column} class="fragment-grid-static-home-column" data-static-home-column={column}>
            {combinedColumns[column].map((card) => renderHomeCard(card))}
          </div>
        ))}
      </div>
      <script
        id={STATIC_HOME_DATA_SCRIPT_ID}
        type="application/json"
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={serializeJson({
          lang,
          path: plan.path,
          snapshotKey: routeConfig?.snapshotKey ?? plan.path,
          homeDemoStylesheetHref: homeInteractiveDeferredStylesheetHref,
          languageSeed,
          fragmentBootstrapHref,
          fragmentOrder: routeState.fragmentOrder,
          planSignature: routeState.planSignature,
          versionSignature: routeState.versionSignature,
          runtimePlanEntries: serializedRuntimePlanEntries,
          runtimeFetchGroups: serializedRuntimeFetchGroups,
          fragmentVersions: serializedFragmentVersions
        })}
      />
    </section>
  )
})

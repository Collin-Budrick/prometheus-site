import { component$ } from '@builder.io/qwik'
import { encodeFragmentPayloadFromTree } from '@core/fragment/binary'
import { buildFragmentFrame } from '@core/fragment/frames'
import type { FragmentDefinition } from '@core/fragment/types'
import { getFragmentCssHref } from '../../fragment/fragment-css'
import type { FragmentPayload, FragmentPayloadValue, FragmentPlanValue } from '../../fragment/types'
import type { FragmentRuntimePlanEntry } from '../../fragment/runtime/protocol'
import type { Lang } from '../../lang'
import { asTrustedHtml } from '../../security/client'
import { useCspNonce } from '../../security/qwik'
import {
  emptyUiCopy,
  type LanguageSeedPayload
} from '../../lang/selection'
import { renderHomeStaticFragmentHtml } from './home-render'
import { renderHomeIntroMarkdownToHtml } from '../core/markdown'
import {
  STATIC_FRAGMENT_BODY_ATTR,
  STATIC_FRAGMENT_CARD_ATTR,
  STATIC_FRAGMENT_VERSION_ATTR,
  STATIC_HOME_WORKER_DATA_SCRIPT_ID,
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
} from '../core/constants'
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
import { normalizeHomeDemoAssetMap } from './home-demo-runtime-types'
import { isSiteFeatureEnabled, siteBrand, siteTemplateConfig } from '../../site-config'
import {
  buildPretextCardAttrs,
  buildPretextTextAttrs,
  PRETEXT_BODY_SPEC,
  PRETEXT_META_SPEC,
  PRETEXT_PILL_SPEC,
  PRETEXT_TITLE_SPEC
} from '../pretext/pretext-static'

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
  pretextCardMode: 'fallback' | 'floor'
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
  runtimeAnchorBootstrapHref: string | null
  runtimeAnchorBootstrapPayloadBase64: string | null
  cards: StaticHomeRenderedCard[]
}

const buildHomeBootstrapFragmentIds = (entries: Array<{ id: string; critical: boolean }>) =>
  entries.flatMap((entry) => {
    const fragmentKind = getHomeStaticFragmentKind(entry.id)
    return entry.critical || fragmentKind === 'dock' ? [entry.id] : []
  })

const concatUint8Arrays = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const next = new Uint8Array(total)
  let offset = 0
  chunks.forEach((chunk) => {
    next.set(chunk, offset)
    offset += chunk.byteLength
  })
  return next
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const encodeBase64Bytes = (bytes: Uint8Array) => {
  let encoded = ''
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1] ?? 0
    const third = bytes[index + 2] ?? 0
    const combined = (first << 16) | (second << 8) | third
    encoded += BASE64_ALPHABET[(combined >> 18) & 63]
    encoded += BASE64_ALPHABET[(combined >> 12) & 63]
    encoded += index + 1 < bytes.byteLength ? BASE64_ALPHABET[(combined >> 6) & 63] : '='
    encoded += index + 2 < bytes.byteLength ? BASE64_ALPHABET[combined & 63] : '='
  }
  return encoded
}

const buildRuntimeBootstrapBytes = (payloads: FragmentPayload[]) => {
  if (!payloads.length) {
    return null
  }

  const frames = payloads.map((payload) => {
    const definition: FragmentDefinition = {
      id: payload.id,
      ttl: payload.meta.ttl,
      staleTtl: payload.meta.staleTtl,
      tags: payload.meta.tags,
      runtime: payload.meta.runtime,
      head: payload.head,
      css: payload.css,
      render: () => payload.tree
    }
    return buildFragmentFrame(
      payload.id,
      encodeFragmentPayloadFromTree(
        definition,
        payload.tree,
        payload.meta.cacheKey,
        payload.html
      )
    )
  })

  return encodeBase64Bytes(concatUint8Arrays(frames))
}

const withStaticRouteLang = (href: string, lang: Lang) => {
  const base = typeof window === 'undefined' ? 'https://example.com' : window.location.origin
  try {
    const url = new URL(href, base)
    url.searchParams.set('lang', lang)
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return href
  }
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
  const orderIndex = new Map<string, number>(HOME_RENDER_ORDER.map((id, index) => [id, index]))
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
  const bootstrapFragmentIds = buildHomeBootstrapFragmentIds(entries)
  const bootstrapFragmentIdSet = new Set(bootstrapFragmentIds)
  const deferredFragmentIds = entries
    .map((entry) => entry.id)
    .filter((fragmentId) => !bootstrapFragmentIdSet.has(fragmentId))
  const runtimeFetchGroups = [
    bootstrapFragmentIds,
    deferredFragmentIds
  ].filter((group) => group.length > 0)

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
    let renderMode: 'preview' | 'rich' | 'shell' | 'stub' | 'active-shell' = 'stub'
    if (stage === 'critical') {
      renderMode = 'rich'
    } else if (activeShell) {
      renderMode = 'active-shell'
    } else if (stage === 'anchor' || fragmentKind === 'dock') {
      renderMode = 'shell'
    } else if (isStaticHomePreviewKind(fragmentKind)) {
      renderMode = 'preview'
    }
    const previewVisible =
      renderMode === 'preview' || renderMode === 'active-shell' || renderMode === 'shell'
    const patchState = stage === 'critical' ? 'ready' : 'pending'
    const lcpStable = Boolean(entry.critical || fragmentKind === 'dock')
    const html = fragment
      ? renderHomeStaticFragmentHtml(fragment.tree, copyBundle, {
          lang,
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
      placement,
      pretextCardMode: html.includes('data-fragment-widget=') ? 'fallback' : 'floor'
    }
  })

  const anchorFragmentIds = bootstrapFragmentIds
  const runtimeAnchorBootstrapPayloadBase64 = buildRuntimeBootstrapBytes(
    anchorFragmentIds.flatMap((fragmentId) => {
      const payload = fragmentMap[fragmentId]
      return payload ? [payload] : []
    })
  )
  const runtimeAnchorBootstrapHref = anchorFragmentIds.length
    ? buildHomeFragmentBootstrapHref({ lang, ids: anchorFragmentIds })
    : null

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
    runtimeAnchorBootstrapHref,
    runtimeAnchorBootstrapPayloadBase64,
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
  const uiCopy = {
    ...emptyUiCopy,
    ...(languageSeed.ui ?? {})
  }
  const deferredFragmentIds = routeState.fragmentOrder.filter(
    (fragmentId) => !routeState.runtimeFetchGroups[0]?.includes(fragmentId)
  )
  const fragmentBootstrapHref = buildHomeFragmentBootstrapHref({
    lang,
    ids: deferredFragmentIds.length ? deferredFragmentIds : routeState.fragmentOrder
  })
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
  const primaryAction = isSiteFeatureEnabled('store')
    ? { href: '/store', label: uiCopy.homePrimaryStoreAction }
    : isSiteFeatureEnabled('lab')
      ? { href: '/lab', label: uiCopy.homePrimaryLabAction }
      : isSiteFeatureEnabled('auth')
        ? { href: '/login', label: uiCopy.homePrimaryAuthAction }
        : { href: '/', label: uiCopy.homePrimaryShellAction }
  const secondaryActions = [
    isSiteFeatureEnabled('auth') && primaryAction.href !== '/login'
      ? { href: '/login', label: uiCopy.homeSecondaryAuthAction }
      : null,
    isSiteFeatureEnabled('pwa')
      ? { href: '/offline', label: uiCopy.homeSecondaryOfflineAction }
      : null
  ].filter((action): action is { href: string; label: string } => action !== null)
  const introCardAttrs = buildPretextCardAttrs({ mode: 'floor' })
  const introMetaLine = `${siteTemplateConfig.preset} preset`
  const introTitle = `${siteBrand.name} template surface`
  const introMetaAttrs = buildPretextTextAttrs({
    ...PRETEXT_META_SPEC,
    lang,
    role: 'meta',
    text: introMetaLine,
    widthKind: 'layout-shell-card'
  })
  const introTitleAttrs = buildPretextTextAttrs({
    ...PRETEXT_TITLE_SPEC,
    lang,
    maxWidthCh: 42,
    role: 'title',
    text: introTitle,
    widthKind: 'layout-shell-card'
  })
  const introTaglineAttrs = buildPretextTextAttrs({
    ...PRETEXT_BODY_SPEC,
    lang,
    maxWidthCh: 64,
    role: 'body',
    text: siteBrand.tagline,
    widthKind: 'layout-shell-card'
  })
  const introAuditAttrs = buildPretextTextAttrs({
    ...PRETEXT_BODY_SPEC,
    lang,
    maxWidthCh: 64,
    role: 'body',
    text: uiCopy.homeIntroAuditLine,
    widthKind: 'layout-shell-card'
  })
  const primaryActionAttrs = buildPretextTextAttrs({
    ...PRETEXT_PILL_SPEC,
    lang,
    role: 'pill',
    text: primaryAction.label,
    widthKind: 'layout-shell-card'
  })
  const secondaryActionAttrs = new Map(
    secondaryActions.map((action) => [
      action.href,
      buildPretextTextAttrs({
        ...PRETEXT_PILL_SPEC,
        lang,
        role: 'pill',
        text: action.label,
        widthKind: 'layout-shell-card'
      })
    ])
  )
  const introProductAttrs = buildPretextTextAttrs({
    ...PRETEXT_PILL_SPEC,
    lang,
    role: 'pill',
    text: siteBrand.product,
    widthKind: 'layout-shell-card'
  })
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
        data-pretext-card-root="true"
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
          ...buildPretextCardAttrs({ mode: card.pretextCardMode }),
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
            data-pretext-card-root="true"
            {...introCardAttrs}
            {...{ [STATIC_HOME_LCP_STABLE_ATTR]: 'true' }}
            data-fragment-id="shell-intro"
            data-fragment-loaded="true"
            data-fragment-ready="true"
            data-fragment-stage="ready"
            data-reveal-phase="visible"
            data-reveal-locked="false"
          >
            <div class="fragment-card-body">
              <div class="home-intro-copy-block">
                <div class="meta-line" data-pretext-role="meta" {...introMetaAttrs}>
                  {introMetaLine}
                </div>
                <div class="home-intro-copy">
                  <h1 data-pretext-role="title" {...introTitleAttrs}>
                    {introTitle}
                  </h1>
                  <span class="home-intro-copy-line" data-pretext-role="body" {...introTaglineAttrs}>
                    {siteBrand.tagline}
                  </span>
                  <span class="home-intro-copy-line" data-pretext-role="body" {...introAuditAttrs}>
                    {uiCopy.homeIntroAuditLine}
                  </span>
                </div>
                <ul class="home-intro-pills">
                  <li>
                    <a
                      class="home-intro-pill"
                      href={withStaticRouteLang(primaryAction.href, lang)}
                      data-pretext-role="pill"
                      {...primaryActionAttrs}
                      data-fragment-link
                    >
                      {primaryAction.label}
                    </a>
                  </li>
                  {secondaryActions.map((action) => (
                    <li key={action.href}>
                      <a
                        class="home-intro-pill"
                        href={withStaticRouteLang(action.href, lang)}
                        data-pretext-role="pill"
                        {...(secondaryActionAttrs.get(action.href) ?? {})}
                        data-fragment-link
                      >
                        {action.label}
                      </a>
                    </li>
                  ))}
                  <li class="home-intro-pill" data-pretext-role="pill" {...introProductAttrs}>
                    {siteBrand.product}
                  </li>
                </ul>
              </div>
              <div
                class="home-intro"
                dangerouslySetInnerHTML={asTrustedHtml(
                  renderHomeIntroMarkdownToHtml(introMarkdown, lang),
                  'template'
                ) as string}
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
        id={STATIC_HOME_WORKER_DATA_SCRIPT_ID}
        type="application/json"
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={serializeJson({
          lang,
          path: plan.path,
          runtimeAnchorBootstrapHref: routeState.runtimeAnchorBootstrapHref,
          runtimeAnchorBootstrapPayloadBase64:
            routeState.runtimeAnchorBootstrapPayloadBase64,
          knownVersions: routeState.fragmentVersions
        })}
      />
      <script
        id={STATIC_HOME_DATA_SCRIPT_ID}
        type="application/json"
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={serializeJson({
          lang,
          path: plan.path,
          snapshotKey: routeConfig?.snapshotKey ?? plan.path,
          homeDemoAssets: normalizeHomeDemoAssetMap(),
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

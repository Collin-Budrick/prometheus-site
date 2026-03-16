import { component$, useVisibleTask$, type Signal } from '@builder.io/qwik'
import {
  FragmentCard,
  FragmentMarkdownBlock
} from '@prometheus/ui'
import {
  buildFragmentHeightPlanSignature,
  buildFragmentHeightVersionSignature,
  getFragmentHeightViewport,
  readFragmentHeightCookieHeights,
  resolveReservedFragmentHeight
} from '@prometheus/ui/fragment-height'
import type { FragmentPayloadMap, FragmentPlan } from '../types'
import type { Lang } from '../../shared/lang-store'
import type { FragmentHeaderCopy } from '../../shared/fragment-copy'
import { asTrustedHtml } from '../../security/client'
import { useCspNonce } from '../../security/qwik'
import { isStaticHomeShellMode } from './fragment-shell-mode'
import type { FragmentDragState, FragmentShellMode, SlottedEntry } from './fragment-shell-types'
import { FragmentRenderer } from './FragmentRenderer'
import { type FragmentInitialStage, readFragmentStableHeight } from './initial-settle'
import {
  GRIDSTACK_CELL_HEIGHT,
  GRIDSTACK_MARGIN,
  getGridstackSlotMetrics,
  parseSlotRows
} from './fragment-shell-utils'
import { getFragmentCssHref } from '../fragment-css'
import type { FragmentRuntimeCardSizing } from '../runtime/protocol'

type FragmentShellCopy = {
  fragmentClose: string
  fragmentLoading: string
}

const DEFAULT_RESERVED_CARD_HEIGHT = 180

type FragmentShellViewProps = {
  shellMode: FragmentShellMode
  path: string
  planEntries: FragmentPlan['fragments']
  hasIntro: boolean
  introMarkdown?: string
  gridRef: Signal<HTMLDivElement | undefined>
  slottedEntries: Signal<SlottedEntry[]>
  fragments: Signal<FragmentPayloadMap>
  initialHtml?: Record<string, string>
  fragmentHeaders: Signal<Record<string, FragmentHeaderCopy>>
  langSignal: Signal<Lang>
  initialLang: Lang
  expandedId: Signal<string | null>
  layoutTick: Signal<number>
  copy: Signal<FragmentShellCopy>
  hasCache: boolean
  skipCssGuard: boolean
  dragState: Signal<FragmentDragState>
  dynamicCriticalIds: Signal<string[]>
  workerSizing: Signal<Record<string, FragmentRuntimeCardSizing>>
}

export const FragmentShellView = component$((props: FragmentShellViewProps) => {
  const {
    shellMode,
    path,
    planEntries,
    hasIntro,
    introMarkdown,
    gridRef,
    slottedEntries,
    fragments,
    initialHtml,
    langSignal,
    expandedId,
    layoutTick,
    copy,
    hasCache,
    skipCssGuard,
    dragState,
    dynamicCriticalIds,
    workerSizing
  } = props
  const isStaticHome = isStaticHomeShellMode(shellMode)
  const nonce = useCspNonce()
  const planSignature = buildFragmentHeightPlanSignature(planEntries.map((entry) => entry.id))
  const versionSignature = buildFragmentHeightVersionSignature(
    planEntries.reduce<Record<string, number>>((acc, entry) => {
      const value = entry.cache?.updatedAt
      if (typeof value === 'number' && Number.isFinite(value)) {
        acc[entry.id] = value
      }
      return acc
    }, {}),
    planEntries.map((entry) => entry.id)
  )
  const planIndexById = new Map(planEntries.map((entry, index) => [entry.id, index]))
  const cookieHeights =
    typeof document !== 'undefined'
      ? readFragmentHeightCookieHeights(document.cookie, {
          path,
          lang: langSignal.value,
          viewport: getFragmentHeightViewport(),
          planSignature,
          versionSignature
        })
      : null

  useVisibleTask$(
    (ctx) => {
      if (!import.meta.env.DEV) return
      if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
      const grid = gridRef.value
      ctx.track(() => gridRef.value)
      if (!grid) return

      const logged = new Set<string>()
      const selector = '.fragment-card[data-fragment-id]'

      const logCard = (card: HTMLElement) => {
        const id = card.dataset.fragmentId
        if (!id || logged.has(id)) return
        if (card.dataset.fragmentReady !== 'true') return
        logged.add(id)
        requestAnimationFrame(() => {
          if (!card.isConnected) return
          const height = Math.round(card.getBoundingClientRect().height)
          const size = card.dataset.size ?? 'auto'
          const critical = card.dataset.critical === 'true' ? 'critical' : 'non-critical'
          console.info(`[fragment-height] ${id} size=${size} ${critical} height=${height}px`)
        })
      }

      const scan = (root: ParentNode) => {
        if (root instanceof HTMLElement && root.matches(selector)) {
          logCard(root)
        }
        root.querySelectorAll?.(selector).forEach((element) => {
          logCard(element as HTMLElement)
        })
      }

      scan(grid)

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes') {
            if (mutation.target instanceof HTMLElement) {
              logCard(mutation.target)
            }
            return
          }
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              scan(node)
            }
          })
        })
      })

      observer.observe(grid, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-fragment-ready']
      })

      ctx.cleanup(() => {
        observer.disconnect()
      })
    },
    { strategy: 'document-idle' }
  )

  return (
    <>
      {(() => {
        const criticalStyles = new Map<string, string>()
        slottedEntries.value.forEach(({ entry }) => {
          if (!entry?.critical) return
          if (getFragmentCssHref(entry.id)) return
          const css = fragments.value[entry.id]?.css
          if (css) criticalStyles.set(entry.id, css)
        })
        if (!criticalStyles.size) return null
        return Array.from(criticalStyles.entries()).map(([id, css]) => (
          <style key={id} nonce={nonce || undefined} data-fragment-css={id}>
            {css}
          </style>
        ))
      })()}
      {hasIntro ? (
        <div class="fragment-grid" data-fragment-grid="intro">
          <div
            class="fragment-slot"
            data-variant="text"
            data-critical="true"
            style={{ gridColumn: '1 / -1' }}
          >
            <div class="fragment-card-wrap">
              <FragmentMarkdownBlock
                id="shell-intro"
                column="1 / -1"
                motionDelay={0}
                expandedId={expandedId}
                layoutTick={layoutTick}
                closeLabel={copy.value.fragmentClose}
                markdown={introMarkdown ?? ''}
                size="big"
                disableMotion={isStaticHome}
              />
            </div>
          </div>
        </div>
      ) : null}
      <div ref={gridRef} class="fragment-grid grid-stack" data-fragment-grid="main">
        {slottedEntries.value.map(({ entry, slot, isSolo }, index) => {
          const fragment = entry ? fragments.value[entry.id] : null
          const html = fragment?.html?.trim()
          const fallbackHtml = entry ? initialHtml?.[entry.id]?.trim() : null
          const renderedHtml = html || fallbackHtml || null
          const slotRows = parseSlotRows(slot.row)
          const inInitialViewport = slotRows.some((row) => row <= 1)
          const isCritical =
            Boolean(entry?.critical) || (entry ? dynamicCriticalIds.value.includes(entry.id) : false)
          const motionDelay = hasCache || isCritical || inInitialViewport ? 0 : index * 120
          const fragmentCssHref = entry ? getFragmentCssHref(entry.id) : null
          const fragmentHasCss = skipCssGuard ? false : Boolean(fragment?.css || fragmentCssHref)
          const gridMetrics = getGridstackSlotMetrics(slot, index)
          const workerCardSizing = entry ? workerSizing.value[entry.id] : null
          const minHeight =
            typeof entry?.layout.minHeight === 'number' && Number.isFinite(entry.layout.minHeight)
              ? Math.max(0, entry.layout.minHeight)
              : null
          const hasLoadedContent = Boolean(fragment || renderedHtml)
          const planIndex = entry ? (planIndexById.get(entry.id) ?? -1) : -1
          const stableHeight =
            entry && typeof window !== 'undefined'
              ? readFragmentStableHeight({
                  fragmentId: entry.id,
                  path,
                  lang: langSignal.value,
                  planSignature,
                  versionSignature
                })
              : null
          const reservedHeight =
            workerCardSizing?.reservedHeight ??
            (entry
              ? resolveReservedFragmentHeight({
                  layout: entry.layout,
                  cookieHeight: planIndex >= 0 ? cookieHeights?.[planIndex] ?? null : null,
                  stableHeight
                })
              : minHeight ?? DEFAULT_RESERVED_CARD_HEIGHT)
          const applyMinHeight = Boolean(reservedHeight && reservedHeight > 0)
          const fragmentStage: FragmentInitialStage = hasLoadedContent ? 'waiting-css' : 'waiting-payload'
          const minHeightRows =
            workerCardSizing?.gridRows ??
            (applyMinHeight && reservedHeight !== null
              ? Math.max(1, Math.ceil((reservedHeight + GRIDSTACK_MARGIN * 2) / GRIDSTACK_CELL_HEIGHT))
              : gridMetrics.h)
          const gridItemStyle = reservedHeight
            ? applyMinHeight
              ? { '--fragment-min-height': `${reservedHeight}px` }
              : undefined
            : undefined
          const gridItemAttrs = {
            'gs-x': gridMetrics.x,
            'gs-y': gridMetrics.y,
            'gs-w': gridMetrics.w,
            'gs-h': minHeightRows,
            'gs-min-w': gridMetrics.w,
            'gs-max-w': gridMetrics.w,
            'gs-no-resize': 'true',
            'gs-id': entry?.id
          }
          return (
            <div
              key={entry?.id ?? slot.id}
              class={{
                'fragment-grid-item': true,
                'grid-stack-item': true,
                'is-solo': isSolo,
                'is-inline': !slot.column.includes('/ -1') && !slot.column.includes('/-1')
              }}
              data-critical={isCritical ? 'true' : undefined}
              data-fragment-id={entry?.id}
              data-column-lock={gridMetrics.column}
              style={gridItemStyle}
              {...gridItemAttrs}
            >
              {entry ? (
                <div class="grid-stack-item-content">
                  <div class="fragment-card-wrap">
                    <FragmentCard
                      key={entry.id}
                      id={entry.id}
                      fragmentId={entry.id}
                      column="1 / -1"
                      motionDelay={motionDelay}
                      expandedId={expandedId}
                      layoutTick={layoutTick}
                      closeLabel={copy.value.fragmentClose}
                      disableMotion={isStaticHome}
                      fragmentLoaded={hasLoadedContent}
                      fragmentHasCss={fragmentHasCss}
                      fragmentStage={fragmentStage}
                      reservedHeight={reservedHeight}
                      fragmentHeightLayout={entry.layout}
                      revealLocked={true}
                      fragmentHeightPersistence={{
                        path,
                        lang: langSignal.value,
                        planSignature,
                        versionSignature,
                        planIndex,
                        planCount: planEntries.length
                      }}
                      critical={isCritical}
                      expandable={isStaticHome ? false : entry.expandable}
                      fullWidth={entry.fullWidth}
                      draggable={!isStaticHome}
                      dragState={dragState}
                    >
                      {renderedHtml ? (
                        <div
                          class="fragment-html"
                          dangerouslySetInnerHTML={asTrustedHtml(renderedHtml, 'server') as string}
                        />
                      ) : fragment ? (
                        <FragmentRenderer node={fragment.tree} />
                      ) : (
                        <div class="fragment-placeholder is-loading" role="status" aria-live="polite">
                          <div class="loader" aria-hidden="true" />
                          <span class="sr-only">{copy.value.fragmentLoading.replace('{id}', entry.id)}</span>
                        </div>
                      )}
                    </FragmentCard>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
})

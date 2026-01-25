import { component$, useVisibleTask$, type Signal } from '@builder.io/qwik'
import { FragmentCard, FragmentMarkdownBlock } from '@prometheus/ui'
import type { FragmentPayloadMap } from '../types'
import type { Lang } from '../../shared/lang-store'
import type { FragmentHeaderCopy } from '../../shared/fragment-copy'
import type { FragmentDragState, SlottedEntry } from './fragment-shell-types'
import { FragmentRenderer } from './FragmentRenderer'
import { applyHeaderOverride } from './header-overrides'
import { getGridstackSlotMetrics, parseSlotRows } from './fragment-shell-utils'
import { getFragmentCssHref } from '../fragment-css'

type FragmentShellCopy = {
  fragmentClose: string
  fragmentLoading: string
}

type FragmentShellViewProps = {
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
}

export const FragmentShellView = component$((props: FragmentShellViewProps) => {
  const {
    hasIntro,
    introMarkdown,
    gridRef,
    slottedEntries,
    fragments,
    initialHtml,
    fragmentHeaders,
    langSignal,
    initialLang,
    expandedId,
    layoutTick,
    copy,
    hasCache,
    skipCssGuard,
    dragState,
    dynamicCriticalIds
  } = props

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
          <style key={id} data-fragment-css={id} dangerouslySetInnerHTML={css} />
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
                disableMotion={true}
                expandedId={expandedId}
                layoutTick={layoutTick}
                closeLabel={copy.value.fragmentClose}
                markdown={introMarkdown ?? ''}
                size="big"
              />
            </div>
          </div>
        </div>
      ) : null}
      <div ref={gridRef} class="fragment-grid grid-stack" data-fragment-grid="main">
        {slottedEntries.value.map(({ entry, slot, isSolo }, index) => {
          const fragment = entry ? fragments.value[entry.id] : null
          const headerCopy = entry ? fragmentHeaders.value[entry.id] : null
          const shouldOverrideHeaders =
            Boolean(fragment && headerCopy) && langSignal.value !== initialLang
          const renderNode = shouldOverrideHeaders
            ? applyHeaderOverride(fragment!.tree, headerCopy!)
            : fragment?.tree
          const allowHtml = entry?.renderHtml !== false
          const html = fragment?.html?.trim()
          const fallbackHtml = entry ? initialHtml?.[entry.id]?.trim() : null
          const useHtml = Boolean(allowHtml && html && !shouldOverrideHeaders)
          const useFallbackHtml = Boolean(
            allowHtml && fallbackHtml && !fragment && !shouldOverrideHeaders
          )
          const slotRows = parseSlotRows(slot.row)
          const inInitialViewport = slotRows.some((row) => row <= 1)
          const isCritical =
            Boolean(entry?.critical) || (entry ? dynamicCriticalIds.value.includes(entry.id) : false)
          const motionDelay = hasCache || isCritical || inInitialViewport ? 0 : index * 120
          const fragmentCssHref = entry ? getFragmentCssHref(entry.id) : null
          const fragmentHasCss = skipCssGuard ? false : Boolean(fragment?.css || fragmentCssHref)
          const gridMetrics = getGridstackSlotMetrics(slot)
          const gridItemAttrs = {
            'gs-x': gridMetrics.x,
            'gs-y': gridMetrics.y,
            'gs-w': gridMetrics.w,
            'gs-h': gridMetrics.h,
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
                      fragmentLoaded={Boolean(fragment)}
                      fragmentHasCss={fragmentHasCss}
                      disableMotion={isCritical}
                      critical={isCritical}
                      expandable={entry.expandable}
                      fullWidth={entry.fullWidth}
                      dragState={dragState}
                    >
                      {fragment ? (
                        useHtml ? (
                          <div class="fragment-html" dangerouslySetInnerHTML={html ?? ''} />
                        ) : (
                          <FragmentRenderer node={renderNode ?? fragment.tree} />
                        )
                      ) : useFallbackHtml ? (
                        <div class="fragment-html" dangerouslySetInnerHTML={fallbackHtml ?? ''} />
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

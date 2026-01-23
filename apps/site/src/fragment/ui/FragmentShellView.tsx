import { component$, useVisibleTask$, type Signal } from '@builder.io/qwik'
import { FragmentCard, FragmentMarkdownBlock } from '@prometheus/ui'
import type { FragmentPayloadMap } from '../types'
import type { Lang } from '../../shared/lang-store'
import type { FragmentHeaderCopy } from '../../shared/fragment-copy'
import type { FragmentDragState, SlottedEntry } from './fragment-shell-types'
import { FragmentRenderer } from './FragmentRenderer'
import { applyHeaderOverride } from './header-overrides'
import { parseSlotRows } from './fragment-shell-utils'
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
  fragmentHeaders: Signal<Record<string, FragmentHeaderCopy>>
  langSignal: Signal<Lang>
  initialLang: Lang
  expandedId: Signal<string | null>
  layoutTick: Signal<number>
  copy: Signal<FragmentShellCopy>
  hasCache: boolean
  skipCssGuard: boolean
  dragState: Signal<FragmentDragState>
}

export const FragmentShellView = component$((props: FragmentShellViewProps) => {
  const {
    hasIntro,
    introMarkdown,
    gridRef,
    slottedEntries,
    fragments,
    fragmentHeaders,
    langSignal,
    initialLang,
    expandedId,
    layoutTick,
    copy,
    hasCache,
    skipCssGuard,
    dragState
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
            data-size="big"
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
      <div ref={gridRef} class="fragment-grid" data-fragment-grid="main">
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
          const useHtml = Boolean(allowHtml && html && !shouldOverrideHeaders)
          const slotRows = parseSlotRows(slot.row)
          const inInitialViewport = slotRows.some((row) => row <= 1)
          const motionDelay = hasCache || entry?.critical || inInitialViewport ? 0 : index * 120
          const fragmentHasCss = skipCssGuard ? false : Boolean(fragment?.css || getFragmentCssHref(entry.id))
          const slotMinHeight =
            typeof entry?.layout.minHeight === 'number' && Number.isFinite(entry.layout.minHeight)
              ? `${entry.layout.minHeight}px`
              : undefined
          const slotStyle = {
            gridColumn: slot.column,
            gridRow: slot.row,
            ...(slotMinHeight ? { '--fragment-slot-min-height': slotMinHeight } : {})
          }
          return (
            <div
              key={slot.id}
              class={{
                'fragment-slot': true,
                'is-solo': isSolo,
                'is-inline': !slot.column.includes('/ -1') && !slot.column.includes('/-1')
              }}
              data-size={slot.size}
              data-critical={entry?.critical ? 'true' : undefined}
              style={slotStyle}
            >
              {entry ? (
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
                    disableMotion={entry.critical === true}
                    critical={entry.critical === true}
                    expandable={entry.expandable}
                    fullWidth={entry.fullWidth}
                    size={slot.size}
                    dragState={dragState}
                  >
                    {fragment ? (
                      useHtml ? (
                        <div class="fragment-html" dangerouslySetInnerHTML={html ?? ''} />
                      ) : (
                        <FragmentRenderer node={renderNode ?? fragment.tree} />
                      )
                    ) : (
                      <div class="fragment-placeholder is-loading" role="status" aria-live="polite">
                        <div class="loader" aria-hidden="true" />
                        <span class="sr-only">{copy.value.fragmentLoading.replace('{id}', entry.id)}</span>
                      </div>
                    )}
                  </FragmentCard>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
})

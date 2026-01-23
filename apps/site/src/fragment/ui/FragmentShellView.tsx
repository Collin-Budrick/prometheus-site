import { component$, type Signal } from '@builder.io/qwik'
import { FragmentCard, FragmentMarkdownBlock } from '@prometheus/ui'
import type { FragmentPayloadMap } from '../types'
import type { Lang } from '../../shared/lang-store'
import type { FragmentHeaderCopy } from '../../shared/fragment-copy'
import type { FragmentDragState, SlottedEntry } from './fragment-shell-types'
import { FragmentRenderer } from './FragmentRenderer'
import { applyHeaderOverride } from './header-overrides'

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

export const FragmentShellView = component$(
  ({
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
  }: FragmentShellViewProps) => (
    <>
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
              style={{ gridColumn: slot.column, gridRow: slot.row }}
            >
              {entry ? (
                <div class="fragment-card-wrap">
                  <FragmentCard
                    key={entry.id}
                    id={entry.id}
                    fragmentId={entry.id}
                    column="1 / -1"
                    motionDelay={hasCache ? 0 : index * 120}
                    expandedId={expandedId}
                    layoutTick={layoutTick}
                    closeLabel={copy.value.fragmentClose}
                    fragmentLoaded={Boolean(fragment)}
                    fragmentHasCss={skipCssGuard ? false : Boolean(fragment?.css)}
                    disableMotion={entry.critical === true}
                    critical={entry.critical === true}
                    expandable={entry.expandable}
                    fullWidth={entry.fullWidth}
                    size={slot.size}
                    dragState={dragState}
                  >
                    {fragment ? (
                      <FragmentRenderer node={renderNode ?? fragment.tree} />
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
)

import { component$ } from '@builder.io/qwik'
import { FRAGMENT_PLAN_CACHE_PAYLOAD_ID } from '../plan-cache'
import type { FragmentShellProps } from './fragment-shell-types'
import { FragmentShellIslands } from './FragmentShellIslands'
import { FragmentShellView } from './FragmentShellView'
import { FragmentStreamController } from './FragmentStreamController'
import { useFragmentShellState } from './fragment-shell-state'
import { useCspNonce } from '../../security/qwik'

export const FragmentShell = component$((props: FragmentShellProps) => {
  const shell = useFragmentShellState(props)
  const nonce = useCspNonce()

  return (
    <section class="fragment-shell">
      <FragmentShellView
        shellMode={shell.shellMode}
        path={props.path}
        planEntries={shell.planValue.fragments}
        hasIntro={shell.hasIntro}
        introMarkdown={props.introMarkdown}
        gridRef={shell.gridRef}
        slottedEntries={shell.slottedEntries}
        fragments={shell.fragments}
        initialHtml={shell.initialHtml}
        fragmentHeaders={shell.fragmentHeaders}
        langSignal={shell.langSignal}
        initialLang={props.initialLang}
        expandedId={shell.expandedId}
        layoutTick={shell.layoutTick}
        copy={shell.copy}
        hasCache={shell.hasCache}
        skipCssGuard={shell.skipCssGuard}
        dragState={shell.dragState}
        dynamicCriticalIds={shell.dynamicCriticalIds}
        workerSizing={shell.workerSizing}
      />
      <FragmentStreamController
        shellMode={shell.shellMode}
        plan={props.plan}
        initialFragments={shell.initialFragments}
        path={props.path}
        fragments={shell.fragments}
        layoutTick={shell.layoutTick}
        status={shell.status}
        paused={shell.streamPaused}
        preserveFragmentEffects={props.preserveFragmentEffects}
        initialLang={props.initialLang}
        dynamicCriticalIds={shell.dynamicCriticalIds}
        workerSizing={shell.workerSizing}
      />
      {shell.planCachePayload ? (
        <script
          id={FRAGMENT_PLAN_CACHE_PAYLOAD_ID}
          type="application/json"
          nonce={nonce || undefined}
          dangerouslySetInnerHTML={shell.planCachePayload}
        />
      ) : null}
      <FragmentShellIslands gridRef={shell.gridRef} />
    </section>
  )
})

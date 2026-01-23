import { component$ } from '@builder.io/qwik'
import { FRAGMENT_PLAN_CACHE_PAYLOAD_ID } from '../plan-cache'
import type { FragmentShellProps } from './fragment-shell-types'
import { FragmentShellClientEffects } from './FragmentShellClientEffects'
import { FragmentShellView } from './FragmentShellView'
import { FragmentStreamController } from './FragmentStreamController'
import { useFragmentShellState } from './fragment-shell-state'

export const FragmentShell = component$((props: FragmentShellProps) => {
  const shell = useFragmentShellState(props)

  return (
    <section class="fragment-shell">
      <FragmentShellView
        hasIntro={shell.hasIntro}
        introMarkdown={props.introMarkdown}
        gridRef={shell.gridRef}
        slottedEntries={shell.slottedEntries}
        fragments={shell.fragments}
        fragmentHeaders={shell.fragmentHeaders}
        langSignal={shell.langSignal}
        initialLang={props.initialLang}
        expandedId={shell.expandedId}
        layoutTick={shell.layoutTick}
        copy={shell.copy}
        hasCache={shell.hasCache}
        skipCssGuard={shell.skipCssGuard}
        dragState={shell.dragState}
      />
      <FragmentStreamController
        plan={props.plan}
        initialFragments={props.initialFragments}
        path={props.path}
        fragments={shell.fragments}
        status={shell.status}
        paused={shell.streamPaused}
        preserveFragmentEffects={props.preserveFragmentEffects}
        initialLang={props.initialLang}
      />
      {shell.planCachePayload ? (
        <script
          id={FRAGMENT_PLAN_CACHE_PAYLOAD_ID}
          type="application/json"
          dangerouslySetInnerHTML={shell.planCachePayload}
        />
      ) : null}
      {shell.clientReady.value ? (
        <FragmentShellClientEffects
          planValue={shell.planValue}
          initialFragmentMap={shell.initialFragmentMap}
        />
      ) : null}
    </section>
  )
})

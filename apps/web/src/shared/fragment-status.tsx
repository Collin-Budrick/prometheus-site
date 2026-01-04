import { createContextId, component$, Slot, useContext, useContextProvider, useSignal, type Signal } from '@builder.io/qwik'

export type FragmentStreamStatus = 'idle' | 'streaming' | 'error'

const FragmentStatusContext = createContextId<Signal<FragmentStreamStatus>>('fragment-status')

export const FragmentStatusProvider = component$(() => {
  const status = useSignal<FragmentStreamStatus>('idle')
  useContextProvider(FragmentStatusContext, status)
  return <Slot />
})

export const useSharedFragmentStatusSignal = () =>
  useContext(FragmentStatusContext) ?? useSignal<FragmentStreamStatus>('idle')

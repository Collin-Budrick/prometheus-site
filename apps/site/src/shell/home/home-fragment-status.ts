import type { HomeStaticBootstrapData } from './home-bootstrap-data'

type FragmentStatusState = 'idle' | 'streaming' | 'error'

type FragmentStatusDocument = Pick<Document, 'querySelector'>

const STATIC_FRAGMENT_STATUS_SELECTOR = '[data-static-fragment-status]'

const resolveFragmentStatusLabel = (
  data: Pick<HomeStaticBootstrapData, 'shellSeed' | 'routeSeed'>,
  state: FragmentStatusState
) => {
  const shellUi = data.shellSeed?.ui
  const routeUi = data.routeSeed?.ui

  const routeLabel =
    state === 'streaming'
      ? routeUi?.fragmentStatusStreaming
      : state === 'error'
        ? routeUi?.fragmentStatusStalled
        : routeUi?.fragmentStatusIdle
  if (typeof routeLabel === 'string' && routeLabel.length > 0) {
    return routeLabel
  }

  const shellLabel =
    state === 'streaming'
      ? shellUi?.fragmentStatusStreaming
      : state === 'error'
        ? shellUi?.fragmentStatusStalled
        : shellUi?.fragmentStatusIdle
  return typeof shellLabel === 'string' && shellLabel.length > 0
    ? shellLabel
    : null
}

export const updateFragmentStatusFromBootstrapData = (
  data: Pick<HomeStaticBootstrapData, 'shellSeed' | 'routeSeed'>,
  state: FragmentStatusState,
  {
    doc = typeof document !== 'undefined' ? document : null
  }: {
    doc?: FragmentStatusDocument | null
  } = {}
) => {
  const element = doc?.querySelector<HTMLElement>(STATIC_FRAGMENT_STATUS_SELECTOR)
  if (!element) {
    return
  }

  element.dataset.state = state
  const label = resolveFragmentStatusLabel(data, state)
  if (label) {
    element.setAttribute('aria-label', label)
  }
}

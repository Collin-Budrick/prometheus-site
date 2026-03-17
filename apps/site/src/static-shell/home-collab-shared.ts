import { appConfig } from '../public-app-config'
import { buildPublicApiUrl } from '../shared/public-api-url'

export const HOME_COLLAB_ROOT_SELECTOR = '[data-home-collab-root]'
export const HOME_COLLAB_TEXTAREA_SELECTOR = '[data-home-collab-input]'
export const HOME_COLLAB_STATUS_SELECTOR = '[data-home-collab-status]'
export const HOME_COLLAB_DEFERRED_STATUS_COPY = 'Focus to start live sync.'
export const HOME_COLLAB_RECONNECT_BASE_MS = 800
export const HOME_COLLAB_RECONNECT_MAX_MS = 5000

export type HomeCollabConnectionMode = 'listener' | 'editor'
export type HomeCollabVisualState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

type HomeCollabRootLike = HTMLElement & {
  dataset: DOMStringMap
}

export const resolveHomeCollabWsUrl = (
  origin: string,
  mode: HomeCollabConnectionMode,
  apiBase = appConfig.apiBase
) => {
  const url = new URL(
    buildPublicApiUrl(mode === 'listener' ? '/home/collab/listener/dock/ws' : '/home/collab/dock/ws', origin, apiBase)
  )
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export const resolveHomeCollabStatusCopy = (
  root: HomeCollabRootLike,
  state: Exclude<HomeCollabVisualState, 'idle'>
) =>
  root.getAttribute(`data-collab-status-${state}`) ??
  ({
    connecting: 'Connecting live sync...',
    live: 'Live for everyone on this page',
    reconnecting: 'Reconnecting live sync...',
    error: 'Realtime unavailable'
  } as const)[state]

export const resolveHomeCollabIdleStatusCopy = (root: HomeCollabRootLike) =>
  root.getAttribute('data-collab-status-idle') ?? HOME_COLLAB_DEFERRED_STATUS_COPY

export const setHomeCollabStatus = (
  root: HomeCollabRootLike,
  status: HTMLElement | null,
  nextState: HomeCollabVisualState
) => {
  root.dataset.collabState = nextState
  if (!status) {
    return
  }

  status.dataset.homeCollabStatus = nextState
  status.textContent =
    nextState === 'idle'
      ? resolveHomeCollabIdleStatusCopy(root)
      : resolveHomeCollabStatusCopy(root, nextState)
}

export const setHomeCollabTextareaState = ({
  textarea,
  busy,
  editable
}: {
  textarea: HTMLTextAreaElement
  busy: boolean
  editable: boolean
}) => {
  textarea.readOnly = !editable
  textarea.setAttribute('aria-busy', busy ? 'true' : 'false')
}

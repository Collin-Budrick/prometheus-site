import type { HomeCollabVisualState } from './home-collab-shared'

export type HomeCollabWorkerInitMessage = {
  type: 'init'
  clientId: string
  origin: string
}

export type HomeCollabWorkerApplyLocalTextMessage = {
  type: 'apply-local-text'
  text: string
}

export type HomeCollabWorkerSuspendMessage = {
  type: 'suspend'
}

export type HomeCollabWorkerResumeMessage = {
  type: 'resume'
}

export type HomeCollabWorkerDestroyMessage = {
  type: 'destroy'
}

export type HomeCollabWorkerInboundMessage =
  | HomeCollabWorkerInitMessage
  | HomeCollabWorkerApplyLocalTextMessage
  | HomeCollabWorkerSuspendMessage
  | HomeCollabWorkerResumeMessage
  | HomeCollabWorkerDestroyMessage

export type HomeCollabWorkerRemoteUpdateMessage = {
  type: 'remote-update'
  text: string
}

export type HomeCollabWorkerStatusMessage = {
  type: 'status'
  status: HomeCollabVisualState
  busy: boolean
  editable: boolean
}

export type HomeCollabWorkerOutboundMessage =
  | HomeCollabWorkerRemoteUpdateMessage
  | HomeCollabWorkerStatusMessage

export type HomeCollabTransportMode = 'crdt' | 'text'

export const shouldUsePlainTextCollabInit = ({
  snapshot,
  text
}: {
  snapshot: string
  text?: string
}) => typeof text === 'string' && snapshot === text

export const buildHomeCollabOutboundUpdate = ({
  mode,
  clientId,
  update,
  text
}: {
  mode: HomeCollabTransportMode
  clientId: string
  update: string
  text: string
}) =>
  mode === 'text'
    ? {
        type: 'home-collab:update' as const,
        text,
        clientId
      }
    : {
        type: 'home-collab:update' as const,
        update,
        clientId
      }

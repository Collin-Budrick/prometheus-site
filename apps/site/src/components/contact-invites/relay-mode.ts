import { appConfig } from '../../app-config'

export const resolveRelayUrls = () =>
  [
    ...(appConfig.p2pRelayBases ?? []),
    ...(appConfig.p2pNostrRelays ?? []),
    ...(appConfig.p2pWakuRelays ?? [])
  ].filter(Boolean)

export const hasRelayDirectory = () => resolveRelayUrls().length > 0

export const resolveCrdtSignaling = () => (appConfig.p2pCrdtSignaling ?? []).filter(Boolean)

export const hasCrdtSignaling = () => resolveCrdtSignaling().length > 0

export const shouldSkipMessagingServer = () =>
  hasRelayDirectory() || hasCrdtSignaling() || Boolean(appConfig.p2pPeerjsServer)

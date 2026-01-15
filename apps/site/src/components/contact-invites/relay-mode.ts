import { appConfig } from '../../app-config'

export const resolveRelayUrls = () =>
  [
    ...(appConfig.p2pRelayBases ?? []),
    ...(appConfig.p2pNostrRelays ?? []),
    ...(appConfig.p2pWakuRelays ?? [])
  ].filter(Boolean)

export const hasRelayDirectory = () => resolveRelayUrls().length > 0

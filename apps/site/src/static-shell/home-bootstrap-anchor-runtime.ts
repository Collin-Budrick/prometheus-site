import { loadHomeAnchorCore } from './home-anchor-core-loader'

export const bootstrapStaticHome = async () =>
  (await loadHomeAnchorCore()).bootstrapStaticHome()

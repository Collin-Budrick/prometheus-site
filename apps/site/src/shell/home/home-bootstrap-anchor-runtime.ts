import { loadHomeAnchorCore } from './runtime-loaders'

export const bootstrapStaticHome = async () =>
  (await loadHomeAnchorCore()).bootstrapStaticHome()

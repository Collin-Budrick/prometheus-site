import { loadHomePostAnchorCore } from './home-post-anchor-core-loader'

export const installHomeBootstrapDeferredRuntime = async () =>
  (await loadHomePostAnchorCore()).installHomeBootstrapDeferredRuntime()

import { loadHomePostAnchorCore } from './home-post-anchor-core-loader'

type InstallHomeStaticEntryOptions = Parameters<
  typeof import('./home-post-anchor-core').installHomeStaticEntry
>[0] & {
  loadCore?: typeof loadHomePostAnchorCore
}

export const installHomeStaticEntry = ({
  loadCore = loadHomePostAnchorCore,
  ...options
}: InstallHomeStaticEntryOptions = {}) => {
  let cleanup: (() => void) | undefined
  let disposed = false

  void loadCore()
    .then(({ installHomeStaticEntry }) => {
      cleanup = installHomeStaticEntry(options)
      if (disposed) {
        cleanup?.()
      }
    })
    .catch((error) => {
      console.error('Static home post-anchor core failed:', error)
    })

  return () => {
    disposed = true
    cleanup?.()
  }
}

if (typeof window !== 'undefined') {
  installHomeStaticEntry()
}
